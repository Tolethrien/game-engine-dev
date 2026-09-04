import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const { productName } = JSON.parse(readFileSync("package.json", "utf8")) as {
  productName: string;
};

const dir = `${productName}-${process.platform}-${process.arch}`;
const exe = process.platform === "win32" ? `${productName}.exe` : productName;

const { status } = spawnSync(path.join("out", dir, exe), { stdio: "inherit" });
process.exit(status ?? 0);
