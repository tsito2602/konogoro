import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, it, vi } from "vitest";

it("未保存内容がある間はSWの再読込を保留し、保存・破棄後に一度だけ反映する", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .find((value) => value.includes("controllerchange"))!;
  const handlers: Record<string, () => void> = {};
  const reload = vi.fn();
  const dataset: Record<string, string> = { unsavedChanges: "true" };
  vm.runInNewContext(script, {
    location: { hostname: "app.example", reload },
    document: { documentElement: { dataset } },
    navigator: {
      serviceWorker: {
        addEventListener: (name: string, fn: () => void) => {
          handlers[name] = fn;
        },
        register: () => Promise.resolve({ update: vi.fn() }),
      },
    },
    window: {
      addEventListener: (name: string, fn: () => void) => {
        handlers[name] = fn;
      },
    },
  });
  handlers.controllerchange();
  handlers["konogoro-draft-settled"]();
  expect(reload).not.toHaveBeenCalled();
  delete dataset.unsavedChanges;
  handlers["konogoro-draft-settled"]();
  handlers.controllerchange();
  expect(reload).toHaveBeenCalledTimes(1);
});
