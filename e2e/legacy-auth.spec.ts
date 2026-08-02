import {expect, test} from "@playwright/test";

const user = {
  id: "user-1",
  name: "Owner Test",
  email: "owner@example.test",
  phone: null,
  email_verified_at: "2026-07-31T10:00:00Z",
  tenant: {id: "tenant-1", name: "Owner Test", slug: "owner-test"},
  roles: [],
  permissions: [],
};

test("browser login uses the cookie session and leaves no token in localStorage", async ({page}) => {
  let loginAuthorization: string | undefined;
  let loginCsrf: string | undefined;
  let loginCompleted = false;
  let authenticatedSessionChecks = 0;
  let businessRequestBeforeSessionBridge = false;

  await page.route("**/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith("/session/csrf")) {
      await route.fulfill({json: {data: {csrf_token: "csrf-e2e-token"}}});
      return;
    }

    if (path.endsWith("/session/me")) {
      if (loginCompleted) {
        authenticatedSessionChecks += 1;
        await route.fulfill({json: {data: {status: "authenticated", user}}});
        return;
      }
      await route.fulfill({
        status: 401,
        json: {title: "Neautentificat", status: 401},
      });
      return;
    }

    if (path.endsWith("/session/login")) {
      loginAuthorization = route.request().headers().authorization;
      loginCsrf = route.request().headers()["x-csrf-token"];
      loginCompleted = true;
      await route.fulfill({
        json: {
          data: {
            status: "authenticated",
            csrf_token: "csrf-after-login",
            user,
          },
        },
      });
      return;
    }

    if (path.endsWith("/me")) {
      if (authenticatedSessionChecks === 0) businessRequestBeforeSessionBridge = true;
      await route.fulfill({json: {data: user}});
      return;
    }

    if (path.endsWith("/companies")) {
      await route.fulfill({json: {data: [{id: "company-1", legal_name: "ACME SRL", tax_id: "12345674", archived_at: null}]}});
      return;
    }

    await route.fulfill({json: {data: []}});
  });

  await page.goto("/login");
  await page.locator('input[name="email"]').fill("owner@example.test");
  await page.locator('input[name="password"]').fill("correct-horse-battery-staple");
  await page.getByRole("button", {name: "Autentificare"}).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("billwise_access_token")))
    .toBeNull();
  expect(loginAuthorization).toBeUndefined();
  expect(loginCsrf).toBe("csrf-e2e-token");
  expect(authenticatedSessionChecks).toBe(1);
  expect(businessRequestBeforeSessionBridge).toBe(false);
});

test("MFA establishes the API cookie before protected business requests", async ({page}) => {
  let phase: "anonymous" | "mfa_pending" | "authenticated" = "anonymous";
  let authenticatedSessionChecks = 0;
  let businessRequestBeforeSessionBridge = false;

  await page.route("**/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith("/session/csrf")) {
      await route.fulfill({json: {data: {csrf_token: "csrf-before-mfa"}}});
      return;
    }

    if (path.endsWith("/session/me")) {
      if (phase === "authenticated") {
        authenticatedSessionChecks += 1;
        await route.fulfill({json: {data: {status: "authenticated", user}}});
        return;
      }
      await route.fulfill({status: 401, json: {title: "Neautentificat", status: 401}});
      return;
    }

    if (path.endsWith("/session/login")) {
      phase = "mfa_pending";
      await route.fulfill({
        status: 202,
        json: {data: {status: "mfa_required", csrf_token: "csrf-mfa-pending", expires_at: "2026-08-02T12:10:00Z"}},
      });
      return;
    }

    if (path.endsWith("/session/mfa")) {
      phase = "authenticated";
      await route.fulfill({
        json: {data: {status: "authenticated", csrf_token: "csrf-after-mfa", user}},
      });
      return;
    }

    if (path.endsWith("/me")) {
      if (authenticatedSessionChecks === 0) businessRequestBeforeSessionBridge = true;
      await route.fulfill({json: {data: user}});
      return;
    }

    if (path.endsWith("/companies")) {
      await route.fulfill({json: {data: [{id: "company-1", legal_name: "ACME SRL", tax_id: "12345674", archived_at: null}]}});
      return;
    }

    await route.fulfill({json: {data: []}});
  });

  await page.goto("/login");
  await page.locator('input[name="email"]').fill("owner@example.test");
  await page.locator('input[name="password"]').fill("correct-horse-battery-staple");
  await page.getByRole("button", {name: "Autentificare"}).click();
  await expect(page.getByRole("heading", {name: "Verificare în doi pași"})).toBeVisible();

  await page.locator('input[name="code"]').fill("123456");
  await page.getByRole("button", {name: "Continuă"}).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  expect(authenticatedSessionChecks).toBe(1);
  expect(businessRequestBeforeSessionBridge).toBe(false);
});

test("failed legacy exchange keeps the stored bearer compatibility path", async ({page}) => {
  let authorization: string | undefined;

  await page.addInitScript(() => {
    localStorage.setItem("billwise_access_token", "legacy-e2e-token");
  });
  await page.route("**/v1/**", async (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/me")) {
      authorization = route.request().headers().authorization;
    }
    await route.fulfill({json: {data: []}});
  });

  await page.goto("/dashboard");

  await expect.poll(() => authorization).toBe("Bearer legacy-e2e-token");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("billwise_access_token")))
    .toBe("legacy-e2e-token");
});

test("legacy PAT is removed only after session confirmation revokes it", async ({page}) => {
  let businessAuthorization: string | undefined;
  let confirmationCount = 0;

  await page.addInitScript(() => {
    localStorage.setItem("billwise_access_token", "legacy-e2e-token");
  });
  await page.route("**/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/session/csrf")) {
      await route.fulfill({json: {data: {csrf_token: "exchange-csrf"}}});
      return;
    }
    if (path.endsWith("/session/exchange")) {
      await route.fulfill({
        json: {data: {status: "exchange_pending_confirmation", csrf_token: "confirmed-csrf", user}},
      });
      return;
    }
    if (path.endsWith("/session/exchange/confirm")) {
      confirmationCount += 1;
      await route.fulfill({json: {data: {status: "exchange_confirmed"}}});
      return;
    }
    if (path.endsWith("/session/me")) {
      await route.fulfill({json: {data: {status: "authenticated", user}}});
      return;
    }
    if (path.endsWith("/me")) {
      businessAuthorization = route.request().headers().authorization;
      await route.fulfill({json: {data: user}});
      return;
    }
    await route.fulfill({json: {data: []}});
  });

  await page.goto("/dashboard");

  await expect.poll(() => confirmationCount).toBe(1);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("billwise_access_token")))
    .toBeNull();
  await expect.poll(() => businessAuthorization).toBeUndefined();
});

test("strict CSP runs authenticated account pages without inline-style violations", async ({page}) => {
  await page.addInitScript(() => {
    (window as typeof window & {__cspViolations?: string[]}).__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      (window as typeof window & {__cspViolations?: string[]}).__cspViolations?.push(
        `${event.violatedDirective}:${event.blockedURI}`,
      );
    });
  });
  await page.route("**/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/session/csrf")) {
      await route.fulfill({json: {data: {csrf_token: "csp-csrf"}}});
      return;
    }
    if (path.endsWith("/session/me")) {
      await route.fulfill({json: {data: {status: "authenticated", user}}});
      return;
    }
    if (path.endsWith("/account/security")) {
      await route.fulfill({json: {data: {mfa: {enabled: false, type: null, confirmed_at: null, recovery_codes_remaining: 0}, password_changed_at: null, active_sessions: 1, mfa_enrollment: {required: false, enrolled: false, required_at: null, grace_active: false}}}});
      return;
    }
    if (path.endsWith("/me")) {
      await route.fulfill({json: {data: user}});
      return;
    }
    await route.fulfill({json: {data: []}});
  });

  await page.goto("/securitate");
  await expect(page.getByRole("heading", {name: "Autentificare în doi pași"})).toBeVisible();
  await page.getByRole("button", {name: "Sesiuni și aplicații"}).click();
  await expect(page).toHaveURL(/\/securitate\?section=sessions$/);
  await page.getByRole("button", {name: "Deconectează toate"}).click();
  await expect(page.getByRole("heading", {name: "Deconectezi toate sesiunile?"})).toBeVisible();

  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(policy).toContain("style-src 'self'");
  expect(policy).toContain("style-src-attr 'none'");
  expect(policy).not.toContain("unsafe-inline");
  const inlineStyles = await page.locator("[style]").evaluateAll((elements) => elements.map((element) => ({
    tag: element.tagName,
    role: element.getAttribute("role"),
    className: element.getAttribute("class"),
    style: element.getAttribute("style"),
  })));
  expect(inlineStyles).toEqual([]);
  expect(await page.evaluate(() => (window as typeof window & {__cspViolations?: string[]}).__cspViolations ?? [])).toEqual([]);
});

test("password change asks for and submits the current password", async ({page}) => {
  let passwordPayload: unknown;

  await page.route("**/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/session/csrf")) {
      await route.fulfill({json: {data: {csrf_token: "password-csrf"}}});
      return;
    }
    if (path.endsWith("/session/me")) {
      await route.fulfill({json: {data: {status: "authenticated", user}}});
      return;
    }
    if (path.endsWith("/account/security")) {
      await route.fulfill({json: {data: {mfa: {enabled: false, type: null, confirmed_at: null, recovery_codes_remaining: 0}, password_changed_at: null, active_sessions: 1}}});
      return;
    }
    if (path.endsWith("/account/password")) {
      passwordPayload = route.request().postDataJSON();
      await route.fulfill({json: {data: {status: "password_updated"}}});
      return;
    }
    if (path.endsWith("/me")) {
      await route.fulfill({json: {data: user}});
      return;
    }
    await route.fulfill({json: {data: []}});
  });

  await page.goto("/securitate");
  await page.getByLabel("Parola actuală").fill("current-password");
  await page.getByLabel("Parola nouă", {exact: true}).fill("new-password-strong");
  await page.getByLabel("Confirmă parola nouă").fill("new-password-strong");
  await page.getByRole("button", {name: "Schimbă parola"}).click();

  await expect.poll(() => passwordPayload).toEqual({
    current_password: "current-password",
    password: "new-password-strong",
    password_confirmation: "new-password-strong",
  });
  await expect(page.getByText("Parola a fost schimbată, iar celelalte sesiuni au fost revocate.")).toBeVisible();
});

test("authentication history can navigate between API pages", async ({page}) => {
  const historyRequests: Array<{page: string; perPage: string | null}> = [];

  await page.route("**/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith("/session/csrf")) {
      await route.fulfill({json: {data: {csrf_token: "history-csrf"}}});
      return;
    }
    if (path.endsWith("/session/me")) {
      await route.fulfill({json: {data: {status: "authenticated", user}}});
      return;
    }
    if (path.endsWith("/account/security")) {
      await route.fulfill({json: {data: {mfa: {enabled: false, type: null, confirmed_at: null, recovery_codes_remaining: 0}, password_changed_at: null, active_sessions: 1}}});
      return;
    }
    if (path.endsWith("/account/auth-history")) {
      const currentPage = url.searchParams.get("_page") ?? "1";
      historyRequests.push({page: currentPage, perPage: url.searchParams.get("_per_page")});
      await route.fulfill({json: {
        data: [{id: `event-${currentPage}`, type: currentPage === "1" ? "login" : "password_changed", outcome: "success", device: null, ip_prefix: null, created_at: "2026-08-02T10:00:00Z"}],
        meta: {pagination: {current_page: Number(currentPage), per_page: 10, total: 11, last_page: 2}},
      }});
      return;
    }
    if (path.endsWith("/me")) {
      await route.fulfill({json: {data: user}});
      return;
    }
    await route.fulfill({json: {data: []}});
  });

  await page.goto("/securitate");
  await expect(page.getByRole("heading", {name: "Parolă"})).toBeVisible();
  await page.getByRole("button", {name: "Istoric", exact: true}).click();
  await expect(page).toHaveURL(/\/securitate\?section=history$/);
  await expect(page.getByText("1–10 din 11")).toBeVisible();
  await page.getByRole("button", {name: "2", exact: true}).click();

  await expect(page.getByText("password changed")).toBeVisible();
  await expect(page.getByText("11–11 din 11")).toBeVisible();
  expect(historyRequests).toContainEqual({page: "2", perPage: "10"});
});

test("notification feed clearly distinguishes unread items and shows their time", async ({page}) => {
  const createdAt = new Date().toISOString();
  let readAt: string | null = null;

  await page.route("**/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/session/csrf")) {
      await route.fulfill({json: {data: {csrf_token: "notifications-csrf"}}});
      return;
    }
    if (path.endsWith("/session/me")) {
      await route.fulfill({json: {data: {status: "authenticated", user}}});
      return;
    }
    if (path.endsWith("/notifications/notification-1/read")) {
      readAt = new Date().toISOString();
      await route.fulfill({json: {data: {id: "notification-1", read_at: readAt}}});
      return;
    }
    if (path.endsWith("/notifications")) {
      await route.fulfill({json: {data: {
        unread_count: readAt ? 0 : 1,
        items: [{
          id: "notification-1",
          type: "overdue_summary",
          title: "Facturi restante",
          message: "ACME SRL are 4 facturi cu sold restant.",
          url: null,
          read_at: readAt,
          created_at: createdAt,
        }],
      }}});
      return;
    }
    if (path.endsWith("/account/security")) {
      await route.fulfill({json: {data: {mfa: {enabled: false, type: null, confirmed_at: null, recovery_codes_remaining: 0}, password_changed_at: null, active_sessions: 1}}});
      return;
    }
    if (path.endsWith("/me")) {
      await route.fulfill({json: {data: user}});
      return;
    }
    if (path.endsWith("/companies")) {
      await route.fulfill({json: {data: [{id: "company-1", legal_name: "ACME SRL", tax_id: "12345674", archived_at: null}]}});
      return;
    }
    await route.fulfill({json: {data: []}});
  });

  await page.goto("/securitate");
  await page.getByRole("button", {name: "Notificări"}).click();

  await expect(page.getByText("1 necitite")).toBeVisible();
  await expect(page.getByText("Nou", {exact: true})).toBeVisible();
  await expect(page.getByLabel("Necitită")).toBeVisible();
  await expect(page.getByText("Acum", {exact: true})).toBeVisible();

  await page.getByText("Facturi restante", {exact: true}).click();
  await page.getByRole("button", {name: "Notificări"}).click();
  await expect(page.getByText("Totul este citit")).toBeVisible();
  await expect(page.getByLabel("Citită")).toBeVisible();
  await expect(page.getByText("Nou", {exact: true})).toHaveCount(0);
});
