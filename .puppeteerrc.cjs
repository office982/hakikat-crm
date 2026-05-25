// Pin Puppeteer's Chrome cache to the project tree so the bundled Chrome
// downloaded during `npm install` survives into runtime. On Render the
// default ~/.cache/puppeteer is wiped between build and runtime; under
// the project root (/opt/render/project/src/) it persists.
//
// Honored by both `puppeteer browsers install` (postinstall) and the
// runtime resolver when puppeteer.launch() looks for the executable.

const { join } = require("path");

module.exports = {
  cacheDirectory: join(__dirname, ".puppeteer-cache"),
};
