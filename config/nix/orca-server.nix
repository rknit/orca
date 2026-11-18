# orcad, its pinned Node, the speech recognizer, and the desktop and mobile web clients.
# The shipped binaries stay as upstream built them; the host runs them through nix-ld.
{
  lib,
  stdenv,
  fetchurl,
  fetchPnpmDeps,
  pnpmConfigHook,
  pnpm_12,
  nodejs_24,
  python3,
  gnumake,
  binutils,
  zstd,
  sqlite,
  writeShellScriptBin,
  src,
  rev,
}:
let
  # The source has no .git; build-source-commit.mjs only asks for HEAD.
  gitHead = writeShellScriptBin "git" ''
    if [ "$*" = "rev-parse HEAD" ]; then echo ${rev}; else echo "git shim: unsupported: $*" >&2; exit 1; fi
  '';

  pnpm = pnpm_12;

  # Must match NODE_RUNTIME_PIN and NODE_RUNTIME_ASSETS['linux-x64-glibc'] in src/shared/node-runtime-pin.ts.
  nodeVersion = "24.22.1";
  nodeArchive = fetchurl {
    url = "https://nodejs.org/dist/v${nodeVersion}/node-v${nodeVersion}-linux-x64.tar.gz";
    sha256 = "eb6728e77c576a35162c122c45ccadf224d89ff00abc8dae46cc2897c6002d7c";
  };
  nodeHeaders = fetchurl {
    url = "https://nodejs.org/dist/v${nodeVersion}/node-v${nodeVersion}-headers.tar.gz";
    sha256 = "322e0a27db9088093ab8347bdc8c7e0aaa21dc9ed548390bf06b394494c09267";
  };

  # orcad-watcher-package.mjs downloads the release watcher; pin it to the lockfile entry instead.
  watcher =
    let
      lines = lib.splitString "\n" (builtins.readFile "${src}/pnpm-lock.yaml");
      headerOf = line: builtins.match "  '@parcel/watcher-linux-x64-glibc@([^']+)':" line;
      index = lib.lists.findFirstIndex (line: headerOf line != null) null lines;
      version = builtins.head (headerOf (builtins.elemAt lines index));
      integrity = builtins.head (
        builtins.match "    resolution: \\{integrity: (sha512-[^}]+)}" (builtins.elemAt lines (index + 1))
      );
    in
    {
      inherit version;
      archive = fetchurl {
        url = "https://registry.npmjs.org/@parcel/watcher-linux-x64-glibc/-/watcher-linux-x64-glibc-${version}.tgz";
        hash = integrity;
      };
    };

  # pnpmfile.cjs turns on the global virtual store outside CI.
  depsArgs = {
    inherit src pnpm;
    fetcherVersion = 4;
    CI = "1";
  };
  rootDeps = fetchPnpmDeps (
    depsArgs
    // {
      pname = "orca-root";
      hash = "sha256-3fX8JuDS948a2QJya064EemUKoX5KfXTRlx0Ez5fnUM=";
    }
  );
  mobileDeps = fetchPnpmDeps (
    depsArgs
    // {
      pname = "orca-mobile";
      prePnpmInstall = "cd mobile";
      hash = "sha256-ThcznJLZzwRBPPQrExXCpik0RnOt2arHde1XBey/+c8=";
    }
  );
in
stdenv.mkDerivation {
  pname = "orca-server";
  version = (lib.importJSON "${src}/package.json").version;
  inherit src;

  nativeBuildInputs = [
    gitHead
    nodejs_24
    pnpm
    pnpmConfigHook
    python3
    gnumake
    binutils
    zstd
    sqlite
  ];

  pnpmDeps = rootDeps;
  CI = "1";
  EXPO_NO_TELEMETRY = "1";
  EXPO_OFFLINE = "1";
  ORCA_TELEMETRY_DISABLED = "1";
  # The sandbox can't reach the registry to verify the packageManager pin; fetchPnpmDeps checked the lockfiles.
  pnpm_config_pm_on_fail = "ignore";
  pnpm_config_trust_lockfile = "true";

  # pnpmConfigHook installs the root workspace; mobile has its own lockfile and store.
  preBuild = ''
    mobileStore=$(mktemp -d)
    tar --zstd -xf ${mobileDeps}/pnpm-store.tar.zst -C "$mobileStore"
    chmod -R +w "$mobileStore"
    if [ -f "$mobileStore/v11/index.db.sql" ]; then
      sqlite3 "$mobileStore/v11/index.db" < "$mobileStore/v11/index.db.sql"
      rm "$mobileStore/v11/index.db.sql"
    fi
    pushd mobile
    pnpm install --offline --ignore-scripts --frozen-lockfile --store-dir "$mobileStore"
    patchShebangs node_modules/{*,.*}
    popd
  '';

  buildPhase = ''
    runHook preBuild

    export ORCA_NODE_RUNTIME_CACHE_DIR=$PWD/out/node-runtime-cache
    install -Dm644 ${nodeHeaders} "$ORCA_NODE_RUNTIME_CACHE_DIR/node-v${nodeVersion}-headers.tar.gz"
    install -Dm644 ${watcher.archive} out/.orcad-watchers/${watcher.version}/linux-x64-glibc/package.tgz

    (cd mobile
      node scripts/build-terminal-webview-engine.mjs
      node scripts/build-mermaid-page-engine.mjs
      node scripts/build-terminal-document-script.mjs)
    node config/scripts/build-workspace-packages.mjs
    pnpm run build:mobile-web

    # build-orcad-node.mjs would also smoke-test the stock pinned Node, which can't load without
    # the host's /lib64 loader. So run its steps here and skip only those runtime smokes.
    node config/scripts/build-orcad-prebuilds.mjs --slot=linux-x64-glibc
    ORCAD_BUILD_TARGET=linux-x64-glibc \
      ORCAD_OUT_DIR=$out/orcad \
      ORCAD_PREBUILDS_DIR=$PWD/out/orcad-prebuilds \
      node config/scripts/build-orcad.mjs
    # build-orcad writes .version only when every smoke check passed.
    test -f $out/orcad/.version

    runtimeSha=$(head -n1 $out/orcad/.runtime-node)
    tar -xzf ${nodeArchive} node-v${nodeVersion}-linux-x64/bin/node
    echo "$runtimeSha  node-v${nodeVersion}-linux-x64/bin/node" | sha256sum -c
    install -Dm755 node-v${nodeVersion}-linux-x64/bin/node $out/runtimes/node-$runtimeSha/bin/node

    pnpm run build:web
    node config/scripts/build-mobile-pwa.mjs

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    cp -aL node_modules/sherpa-onnx-linux-x64 $out/speech
    # Both clients share one root: asset names are content hashes, and index.html is the phone's.
    mkdir -p $out/web
    cp -a out/web/. $out/web/
    cp -a out/mobile-pwa/. $out/web/
    runHook postInstall
  '';

  # Keep upstream binaries and the pinned Node byte for byte; their hashes are part of the slot layout.
  dontFixup = true;

  meta.platforms = [ "x86_64-linux" ];
}
