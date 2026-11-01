import re, sys, time, json, urllib.request
from playwright.sync_api import sync_playwright, expect

BASE = "http://localhost:5173"
results, errors = [], []
def check(name, cond, extra=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if (extra and not cond) else ""), flush=True)

uid = str(int(time.time()))[-6:]
def vis(loc, t=6000):
    try:
        loc.first.wait_for(state="visible", timeout=t); return True
    except Exception:
        return False
with sync_playwright() as p:
    br = p.chromium.launch()
    ctxA = br.new_context(viewport={"width": 1366, "height": 900})
    a = ctxA.new_page()
    a.on("console", lambda m: errors.append(("A", m.text)) if m.type == "error" else None)
    a.on("pageerror", lambda e: errors.append(("A-page", str(e))))

    # --- register via UI
    a.goto(BASE + "/register")
    a.get_by_label("Full name").fill("Mega Tester")
    a.get_by_label("Email").fill(f"mega{uid}@x.com")
    a.get_by_label(re.compile("Password")).fill("password1")
    a.get_by_role("button", name="Create account").click()
    a.wait_for_url(BASE + "/")
    check("register lands on projects", a.get_by_role("heading", name="Projects").is_visible())

    # --- profile dashboard
    a.get_by_role("link", name="My dashboard").click()
    a.wait_for_url("**/profile")
    check("dashboard shows stats", vis(a.get_by_text("Open tasks assigned to you")))
    a.get_by_label("Job title").fill("Full-stack developer")
    a.get_by_label(re.compile("About you")).fill("Building Taskboard.")
    a.get_by_role("button", name="Save changes").click()
    check("profile saved message", vis(a.get_by_text("Profile saved.")))
    a.reload()
    check("profile persists after reload", a.get_by_label("Job title").input_value() == "Full-stack developer")
    a.get_by_label("Current password").fill("password1")
    a.get_by_label("New password", exact=False).first.fill("newpassword1")
    a.get_by_label("Confirm new password").fill("different1")
    a.get_by_role("button", name="Update password").click()
    check("password mismatch caught", vis(a.get_by_text("The new passwords do not match.")))
    a.get_by_label("Confirm new password").fill("newpassword1")
    a.get_by_role("button", name="Update password").click()
    check("password updated", vis(a.get_by_text("Password updated.")))
    a.screenshot(path="/tmp/shots/profile.png", full_page=True)

    # --- project + board
    a.get_by_role("link", name="Projects").click()
    a.get_by_placeholder("New project name").fill("Launch")
    a.get_by_role("button", name="Create project").click()
    a.get_by_role("link", name=re.compile("Launch")).click()
    a.wait_for_url("**/projects/*")
    a.locator(".column").first.wait_for()
    check("three default lists", a.locator(".column").count() >= 3)

    # quick add in a list
    a.get_by_label("Add a task to To do").fill("Write README")
    a.get_by_label("Add a task to To do").press("Enter")
    a.get_by_text("Write README").first.wait_for()
    check("quick add creates card with key", a.locator(".card", has_text="Write README").locator(".task-key").inner_text().startswith("TB-"))

    # natural-language add
    a.get_by_label("Describe a task in plain words").fill("Fix login bug tomorrow high priority #backend 2h")
    a.get_by_role("button", name="Preview").click()
    a.get_by_role("button", name="Create task").wait_for()
    check("nl preview shows parsed fields", vis(a.locator(".nl-preview").get_by_text("120 min")) and vis(a.locator(".nl-preview .p-high")))
    a.get_by_role("button", name="Create task").click()
    a.locator(".card", has_text="Fix login bug").wait_for()
    check("nl task appears on board", True)

    # drag and drop between lists
    card = a.locator(".card", has_text="Write README")
    target = a.locator(".column", has_text="In progress")
    card.drag_to(target)
    a.wait_for_timeout(800)
    check("drag and drop moves card", a.locator(".column", has_text="In progress").locator(".card", has_text="Write README").count() == 1)

    # task modal
    a.locator(".card", has_text="Fix login bug").click()
    modal = a.get_by_role("dialog")
    modal.get_by_label(re.compile("Minutes|Estimate")).first.wait_for()
    modal.get_by_placeholder("https://…").fill("https://docs.google.com/document/d/abc")
    modal.get_by_role("button", name="Add link").click()
    modal.get_by_text("Drive").wait_for()
    check("task link detected as Drive", True)
    modal.get_by_placeholder("Write a comment").fill("Looks good")
    modal.get_by_role("button", name="Post comment").click()
    modal.get_by_text("Looks good").wait_for()
    check("comment posted", True)
    a.screenshot(path="/tmp/shots/modal.png")
    modal.get_by_role("button", name="Close").click()

    # views
    a.get_by_role("tab", name="List").click()
    a.locator("tbody tr").first.wait_for()
    check("list view shows tasks", a.locator("tbody tr").count() >= 2)
    a.get_by_role("tab", name="Calendar").click()
    check("calendar renders month", vis(a.locator(".cal-grid")))
    a.get_by_role("tab", name="Board").click()

    # add teammate B, chat live between two browsers
    a.get_by_role("button", name="Team").click()
    emailB = f"ben{uid}@x.com"
    ctxB = br.new_context(viewport={"width": 1366, "height": 900})
    b = ctxB.new_page()
    b.on("console", lambda m: errors.append(("B", m.text)) if m.type == "error" else None)
    b.on("pageerror", lambda e: errors.append(("B-page", str(e))))
    b.goto(BASE + "/register")
    b.get_by_label("Full name").fill("Ben Member")
    b.get_by_label("Email").fill(emailB)
    b.get_by_label(re.compile("Password")).fill("password1")
    b.get_by_role("button", name="Create account").click()
    b.wait_for_url(BASE + "/")
    a.get_by_placeholder("Teammate's email").fill(emailB)
    a.get_by_role("button", name="Add member").click()
    a.get_by_text("Ben Member").first.wait_for()
    check("owner adds member by email", True)
    b.reload()
    b.get_by_role("link", name=re.compile("Launch")).click()
    b.wait_for_url("**/projects/*")
    check("member does not see Integrations tab", b.get_by_role("tab", name="Integrations").count() == 0)
    check("owner sees Integrations tab", a.get_by_role("tab", name="Integrations").count() == 1)
    # member can delete a list + assign (permission request)
    b.get_by_placeholder("New list name").fill("Scratch")
    b.get_by_role("button", name="Add list").click()
    b.locator(".column", has_text="Scratch").wait_for()
    b.once("dialog", lambda d: d.accept())
    b.locator(".column", has_text="Scratch").get_by_role("button", name="Delete").click()
    b.wait_for_timeout(800)
    check("non-owner member deletes a list in UI", b.locator(".column", has_text="Scratch").count() == 0)

    a.get_by_role("tab", name="Chat").click()
    b.get_by_role("tab", name="Chat").click()
    a.get_by_label("Message your team").fill("Hello from Mega")
    a.get_by_role("button", name="Send").click()
    b.get_by_text("Hello from Mega").wait_for(timeout=5000)
    check("chat message arrives live for teammate", True)
    b.get_by_label("Message your team").fill("Hi Mega!")
    b.get_by_role("button", name="Send").click()
    a.get_by_text("Hi Mega!").wait_for(timeout=5000)
    check("chat reply arrives live for owner", True)
    a.screenshot(path="/tmp/shots/chat.png")

    # unread badge: A on board tab, B sends
    a.get_by_role("tab", name="Board").click()
    b.get_by_label("Message your team").fill("ping")
    b.get_by_role("button", name="Send").click()
    a.locator(".unread").wait_for(timeout=5000)
    check("unread badge shows on chat tab", a.locator(".unread").inner_text() == "1")

    # AI tab on small project: honest fallback
    a.get_by_role("tab", name="AI").click()
    a.get_by_text("Task duration model").wait_for()
    check("small project explains missing history", vis(a.get_by_text(re.compile("Needs at least 30 finished tasks"))))

    # integrations tab
    a.get_by_role("tab", name="Integrations").click()
    a.get_by_role("heading", name="GitHub").wait_for()
    a.get_by_role("button", name="Turn on").first.click()
    a.get_by_label("Payload URL").wait_for()
    check("github webhook details shown", "/api/inbound/github/" in a.get_by_label("Payload URL").input_value())
    check("localhost warning shown", vis(a.get_by_text("cannot reach")))
    a.get_by_placeholder("").first  # no-op
    a.screenshot(path="/tmp/shots/integrations.png", full_page=True)

    # sample project + AI tab
    a.get_by_role("link", name="Projects").click()
    a.get_by_role("button", name=re.compile("sample project")).click()
    a.get_by_role("link", name=re.compile("Sample project")).wait_for()
    check("sample project tagged", vis(a.get_by_text("Sample data")))
    a.get_by_role("link", name=re.compile("Sample project")).click()
    a.wait_for_url("**/projects/*")
    a.get_by_role("tab", name="AI").click()
    a.get_by_text("Late-risk model").wait_for()
    a.wait_for_timeout(500)
    check("synthetic warning shown", vis(a.get_by_text("synthetic sample data").first))
    check("duration model metrics shown", vis(a.get_by_text("Trained model").first))
    check("late-risk metrics shown", vis(a.get_by_text(re.compile("Ranking quality")).first))
    check("forecast dates shown", vis(a.get_by_text("Best case")))
    a.locator(".panel", has_text="Open tasks: predictions").locator("tbody tr").first.wait_for()
    check("predictions table rows", a.locator(".panel", has_text="Open tasks: predictions").locator("tbody tr").count() > 0)
    a.screenshot(path="/tmp/shots/ai.png", full_page=True)
    a.get_by_role("button", name="Write summary").click()
    a.get_by_text(re.compile("template \\(no AI key set\\)")).wait_for()
    check("summary falls back to template without key", True)
    a.get_by_placeholder("What should we worry about this week?").fill("what is at risk")
    a.get_by_role("button", name="Ask").click()
    a.get_by_text(re.compile("ANTHROPIC_API_KEY")).wait_for()
    check("ask explains the missing key", True)
    a.get_by_role("tab", name="Board").click()
    a.locator(".card").first.wait_for()
    a.screenshot(path="/tmp/shots/sample_board.png")
    check("board of sample project renders cards with risk badges", a.locator(".card").count() > 5)

    # mobile layout
    a.set_viewport_size({"width": 390, "height": 800})
    a.wait_for_timeout(300)
    overflow = a.evaluate("document.documentElement.scrollWidth > window.innerWidth + 2")
    check("no horizontal page overflow at 390px", not overflow)
    a.screenshot(path="/tmp/shots/mobile.png")

    br.close()

print("\nconsole/page errors:", json.dumps(errors[:8]))
bad = [n for n, ok in results if not ok]
print(f"\n{len(results)-len(bad)} passed, {len(bad)} failed", bad)
sys.exit(1 if bad else 0)
