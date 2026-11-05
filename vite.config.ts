import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import packageInfo from "./package.json";

/** 配信中のバージョンを index.html に書き、開いたままのアプリが更新のお知らせに表示できるようにする。 */
const appVersionMeta = (): Plugin => ({
  name: "konogoro-app-version",
  transformIndexHtml: () => [
    { tag: "meta", attrs: { name: "app-version", content: packageInfo.version }, injectTo: "head" },
  ],
});

export default defineConfig({
  plugins: [react(), cloudflare(), appVersionMeta()],
  build: {
    // 父の iPhone 6s は iOS 15 まで。新しい書き方を iOS 15 の Safari が読める形に直して出す。
    target: ["es2020", "safari15"],
    cssTarget: ["safari15"],
    // 日本語フォントは unicode-range ごとの小さなファイルに分かれる。CSS へ埋め込まず、使う文字の分だけ取得させる。
    assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined),
  },
});
