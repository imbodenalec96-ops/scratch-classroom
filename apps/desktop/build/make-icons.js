// One-time icon generator. Reads apps/web/public/icons/icon-512.png
// and writes both .icns (macOS) and .ico (Windows) into this dir so
// electron-builder can pick them up.
//
// Run once after first install:   node build/make-icons.js
// Then run:                        npm run build:mac  (or build:win)

const fs = require("fs");
const path = require("path");
const png2icons = require("png2icons");

const SRC = path.resolve(__dirname, "../../web/public/icons/icon-512.png");
const ICNS_OUT = path.resolve(__dirname, "icon.icns");
const ICO_OUT = path.resolve(__dirname, "icon.ico");
const PNG_OUT = path.resolve(__dirname, "icon.png"); // some platforms also want a 512 png

if (!fs.existsSync(SRC)) {
  console.error(`Source PNG not found: ${SRC}`);
  process.exit(1);
}

const png = fs.readFileSync(SRC);
fs.writeFileSync(PNG_OUT, png);

const icns = png2icons.createICNS(png, png2icons.BILINEAR, 0);
if (!icns) {
  console.error("Failed to generate .icns");
  process.exit(1);
}
fs.writeFileSync(ICNS_OUT, icns);
console.log(`✓ Wrote ${ICNS_OUT} (${(icns.length / 1024).toFixed(1)} KB)`);

const ico = png2icons.createICO(png, png2icons.BILINEAR, 0, false);
if (!ico) {
  console.error("Failed to generate .ico");
  process.exit(1);
}
fs.writeFileSync(ICO_OUT, ico);
console.log(`✓ Wrote ${ICO_OUT} (${(ico.length / 1024).toFixed(1)} KB)`);

console.log("\nIcons ready. Now run:");
console.log("  npm run build:mac    # produces apps/desktop/dist/Scratch Classroom-1.0.0.dmg");
console.log("  npm run build:win    # produces apps/desktop/dist/Scratch Classroom Setup 1.0.0.exe");
