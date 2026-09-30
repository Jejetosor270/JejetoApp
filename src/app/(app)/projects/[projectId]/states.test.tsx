// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import ProjectError from "./error";
import ProjectLoading from "./loading";
import ProjectNotFound from "./not-found";
import { clickText, mountForm } from "@/test/dom-form";
it("offers retry without exposing database failure details or showing zero financials", async () => {
  let retried = false;
  const view = await mountForm(
    <ProjectError
      error={new Error("private database detail")}
      reset={() => {
        retried = true;
      }}
    />,
  );
  try {
    expect(document.body.textContent).toContain(
      "Financial figures are unavailable",
    );
    expect(document.body.textContent).not.toContain("private database detail");
    expect(document.body.textContent).not.toContain("0.00");
    await clickText("Try again");
    expect(retried).toBe(true);
  } finally {
    await view.unmount();
  }
});
it("provides distinct loading and not-found states", () => {
  const loading = renderToStaticMarkup(<ProjectLoading />);
  expect(loading).toContain('aria-busy="true"');
  expect(loading).toContain("Loading Project");
  const missing = renderToStaticMarkup(<ProjectNotFound />);
  expect(missing).toContain("Project not found");
  expect(missing).toContain('href="/projects"');
});
