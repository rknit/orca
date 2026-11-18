{
  description = "Orca headless server (orcad) and its web clients";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

  outputs =
    { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      packages.${system} = rec {
        orca-server = pkgs.callPackage ./config/nix/orca-server.nix {
          src = self;
          # The web build pins official skills to this commit; a dirty tree reports its base.
          rev = self.rev or (pkgs.lib.removeSuffix "-dirty" self.dirtyRev);
        };
        default = orca-server;
      };
    };
}
