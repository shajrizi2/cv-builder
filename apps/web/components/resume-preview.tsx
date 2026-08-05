import type { ReactNode } from 'react';
import type { ResumeContent, ResumeSectionKey } from '@cv-builder/resume-schema';

function range(start: string, end: string, current = false) {
  return [start, current ? 'Present' : end].filter(Boolean).join(' – ');
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="preview-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function ResumePreview({ content }: { content: ResumeContent }) {
  const p = content.personalInfo;
  const sections: Record<ResumeSectionKey, ReactNode> = {
    personalInfo: (
      <header className="preview-header">
        <h1>{p.fullName || 'Your name'}</h1>
        <p>{[p.email, p.phone, p.location].filter(Boolean).join(' · ')}</p>
      </header>
    ),
    summary: content.summary && (
      <Section title="Profile">
        <p>{content.summary}</p>
      </Section>
    ),
    experience: content.experience.length > 0 && (
      <Section title="Experience">
        {content.experience.map((item) => (
          <article key={item.id}>
            <div className="preview-row">
              <h3>
                {item.position || 'Position'}
                {item.company && ` · ${item.company}`}
              </h3>
              <span>{range(item.startDate, item.endDate, item.current)}</span>
            </div>
            {item.location && <p className="muted">{item.location}</p>}
            <p>{item.description}</p>
          </article>
        ))}
      </Section>
    ),
    education: content.education.length > 0 && (
      <Section title="Education">
        {content.education.map((item) => (
          <article key={item.id}>
            <div className="preview-row">
              <h3>
                {item.qualification || item.field || 'Qualification'}
                {item.institution && ` · ${item.institution}`}
              </h3>
              <span>{range(item.startDate, item.endDate)}</span>
            </div>
            <p>{item.description}</p>
          </article>
        ))}
      </Section>
    ),
    skills: content.skills.length > 0 && (
      <Section title="Skills">
        <p>
          {content.skills
            .map((item) => [item.name, item.level].filter(Boolean).join(' — '))
            .filter(Boolean)
            .join(' · ')}
        </p>
      </Section>
    ),
    languages: content.languages.length > 0 && (
      <Section title="Languages">
        <p>
          {content.languages
            .map((item) => [item.name, item.proficiency].filter(Boolean).join(' — '))
            .filter(Boolean)
            .join(' · ')}
        </p>
      </Section>
    ),
    links: content.links.length > 0 && (
      <Section title="Links">
        <ul>
          {content.links.map((item) => (
            <li key={item.id}>
              {item.label || item.url}
              {item.label && item.url && `: ${item.url}`}
            </li>
          ))}
        </ul>
      </Section>
    ),
  };
  return (
    <article className="a4-preview" aria-label="Live resume preview">
      {content.sectionOrder.map(
        (key) => content.sectionVisibility[key] && <div key={key}>{sections[key]}</div>,
      )}
    </article>
  );
}
