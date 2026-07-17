// Dynamic config so the Android google-services.json can come from an EAS file
// env var (kept out of git) instead of a committed file.
//
// On EAS Build: the GOOGLE_SERVICES_JSON file env var is materialised to a temp
// path, which we point googleServicesFile at.
// Locally (expo run:android): the env var is unset, so we fall back to the file
// sitting in this folder.
//
// Everything else is inherited unchanged from app.json (passed in as `config`).
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON || config.android?.googleServicesFile || './google-services.json',
  },
});
