import { Link } from 'react-router-dom';

const features = [
  {
    title: 'One project, three ways to look at it',
    text: 'Drag tasks between lists on the board, scan them in a table, or see due dates on a month calendar. It is the same set of tasks every time.',
    wide: true,
  },
  { title: 'Made for teams', text: 'Invite people by email, assign tasks, see who is online, and chat inside each project.' },
  { title: 'Type a task, check it, create it', text: 'Write “Fix login bug tomorrow high priority @ben #backend 2h” and preview how Taskboard read it before anything is saved.' },
  {
    title: 'Early warning for late tasks',
    text: 'Once a project has finished tasks to learn from, Taskboard flags open tasks likely to miss their due date and shows a best, typical and slow finish date.',
    wide: true,
  },
  { title: 'Connects to your tools', text: 'Post activity to Slack or Discord, link GitHub pull requests to tasks, subscribe to due dates in Google Calendar, or create tasks by email and API.', band: true },
];

const steps = [
  { title: 'Create a project', text: 'It starts with To do, In progress and Done lists. Rename them or add your own.' },
  { title: 'Add tasks and invite your team', text: 'Set priority, due dates, estimates and assignees. Link a task to the files and pull requests behind it.' },
  { title: 'Watch what is slipping', text: 'The dashboard and AI tab show workload, overdue work and which tasks are at risk, so you can act before the deadline.' },
];

function BoardPreview() {
  return (
    <div className="lp-mock" aria-hidden="true">
      <div className="lp-mock-bar">
        <span className="lp-dot" /><span className="lp-dot" /><span className="lp-dot" />
        <span className="lp-mock-title">Website relaunch</span>
        <span className="lp-mock-online">3 online</span>
      </div>
      <div className="lp-mock-cols">
        <div className="lp-mock-col">
          <h4>To do <span>3</span></h4>
          <div className="lp-mock-card p-b-high"><b>TB-14</b> Write release notes<div><i className="lp-chip hi">high</i><i className="lp-chip">docs</i></div></div>
          <div className="lp-mock-card p-b-low"><b>TB-15</b> Update pricing page<div><i className="lp-chip lo">low</i></div></div>
        </div>
        <div className="lp-mock-col">
          <h4>In progress <span>2</span></h4>
          <div className="lp-mock-card p-b-urgent"><b>TB-11</b> Fix checkout redirect<div><i className="lp-chip ur">urgent</i><i className="lp-chip risk">high late risk</i></div></div>
          <div className="lp-mock-card p-b-med"><b>TB-12</b> Mobile navigation<div><i className="lp-chip md">medium</i><i className="lp-chip">frontend</i></div></div>
        </div>
        <div className="lp-mock-col">
          <h4>Done <span>4</span></h4>
          <div className="lp-mock-card done"><b>TB-09</b> Set up staging site</div>
          <div className="lp-mock-card done"><b>TB-10</b> Draft homepage copy</div>
        </div>
      </div>
      <div className="lp-mock-forecast">
        <span>Forecast finish</span>
        <b>12 Dec</b><em>typical</em>
        <span className="lp-range">best 5 Dec · slow 24 Dec</span>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <Link to="/" className="lp-brand"><span className="lp-logo" aria-hidden="true" />Taskboard</Link>
        <nav className="lp-links" aria-label="Page sections">
          <a href="#features">What it does</a>
          <a href="#how">How it works</a>
        </nav>
        <div className="lp-nav-cta">
          <Link to="/login" className="btn lp-btn-quiet">Sign in</Link>
          <Link to="/register" className="btn btn-primary">Get started</Link>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-copy">
          <h1>Plan your team’s work on one shared board.</h1>
          <p className="lp-lead">
            Taskboard is a project workspace for small teams. Move tasks across lists, talk in the same place the work
            lives, and get a warning when a task is likely to finish late.
          </p>
          <div className="lp-cta">
            <Link to="/register" className="btn btn-primary lp-btn-lg">Create a free account</Link>
            <Link to="/login" className="btn lp-btn-lg">Sign in</Link>
          </div>
          <p className="lp-note">Setting up your first project takes about a minute.</p>
        </div>
        <BoardPreview />
      </section>

      <section id="features" className="lp-section">
        <h2>Everything a small team needs to stay on the same page</h2>
        <div className="lp-features">
          {features.map((f) => (
            <article key={f.title} className={`lp-feature ${f.wide ? 'wide' : ''} ${f.band ? 'band' : ''}`}>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="how" className="lp-section lp-how">
        <h2>From empty project to clear picture</h2>
        <ol className="lp-steps">
          {steps.map((s) => (
            <li key={s.title}>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="lp-final">
        <div>
          <h2>Want to look around first?</h2>
          <p>Create an account, then add the sample project. It comes with six months of made-up history so you can see the AI tab working.</p>
        </div>
        <Link to="/register" className="btn lp-btn-lg lp-btn-light">Create a free account</Link>
      </section>

      <footer className="lp-foot">
        <span>Taskboard</span>
        <span>Built by ❤️ @Megha</span>
        <Link to="/login">Sign in</Link>
      </footer>
    </div>
  );
}
