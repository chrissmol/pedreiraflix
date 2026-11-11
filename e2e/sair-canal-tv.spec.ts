import { expect, test } from "@playwright/test";
import { seedSession } from "./helpers";

// Fire TV 960x540. Chris (11/11): abriu 3 canais ao vivo, saiu e o provedor recusou o filme ("maximo de conexoes").
// Prova que ao sair de cada canal (Voltar do controle) o app para de pedir ao provedor: nenhum pedido novo depois.
test.use({
  userAgent:
    "Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36",
  viewport: { width: 960, height: 540 },
});
const MOCK = "http://localhost:8790";

test("TV: abrir 3 canais e sair de cada um nao deixa pedidos ao provedor depois da saida", async ({
  page,
}) => {
  await page.request.get(`${MOCK}/__mock/live-redirect?on=1`);
  await seedSession(page);
  const pedidos: { t: number; url: string }[] = [];
  page.on(
    "request",
    (r) =>
      r.url().includes("/api/stream") &&
      pedidos.push({ t: Date.now(), url: r.url().slice(-60) }),
  );
  const abertos = new Set<string>();
  page.on(
    "request",
    (r) => r.url().includes("/api/stream") && abertos.add(r.url()),
  );
  page.on("requestfinished", (r) => abertos.delete(r.url()));
  page.on("requestfailed", (r) => abertos.delete(r.url()));
  for (const id of ["101", "102", "103"]) {
    await page.goto("/live");
    await page.goto(`/watch/live/${id}?name=C${id}`);
    await page.waitForFunction(
      () => (document.querySelector("video")?.currentTime ?? 0) > 1,
      null,
      { timeout: 15000 },
    );
    await page.goBack(); // Voltar da Samsung/LG = history.back()
    await expect(page).not.toHaveURL(/\/watch\//);
  }
  const saida = Date.now();
  await page.waitForTimeout(6000);
  const depois = pedidos.filter((p) => p.t > saida + 500);
  console.log(
    "sessoes:",
    JSON.stringify(
      await (await page.request.get(`${MOCK}/__mock/live-sessions`)).json(),
    ),
    "pedidos depois da saida:",
    depois.length,
    "abertos:",
    abertos.size,
  );
  await page.request.get(`${MOCK}/__mock/live-redirect?on=0`);
  expect(depois).toEqual([]);
  expect(abertos.size).toBe(0);
});

test("TV: filme recusado logo depois de canais ao vivo explica e tenta de novo sozinho ate o provedor liberar", async ({
  page,
}) => {
  await seedSession(page);
  await page.goto("/live");
  const irPara = (url: string) =>
    page.evaluate((u) => {
      history.pushState({}, "", u);
      dispatchEvent(new PopStateEvent("popstate"));
    }, url); // dentro do app, sem recarregar
  await irPara("/watch/live/101?name=C101");
  await page.waitForFunction(
    () => (document.querySelector("video")?.currentTime ?? 0) > 1,
    null,
    { timeout: 15000 },
  );
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/live$/);
  let recusas = 0;
  await page.route(/\/api\/stream\?.*%2Fmovie%2F/, (route) =>
    recusas++ < 2
      ? route.fulfill({ status: 403, body: "forbidden" })
      : route.continue(),
  );
  await irPara("/watch/movie/1?ext=mp4&name=Filme");
  await expect(page.getByText(/tentando de novo sozinho/)).toBeVisible();
  await page.waitForFunction(
    () => (document.querySelector("video")?.currentTime ?? 0) > 1,
    null,
    { timeout: 30000 },
  );
});
