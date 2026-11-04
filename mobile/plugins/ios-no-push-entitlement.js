const { withEntitlementsPlist } = require('expo/config-plugins')

// A self-built app has no use for APNs: this build never starts push, and free Apple IDs can't sign the entitlement.
module.exports = (config) =>
  withEntitlementsPlist(config, (mod) => {
    delete mod.modResults['aps-environment']
    return mod
  })
