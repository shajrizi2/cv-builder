'use client';

import {
  updateResumeInputSchema,
  type Resume,
  type ResumeContent,
  type ResumeSectionKey,
  resumeTemplateIds,
} from '@cv-builder/resume-schema';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAutosave } from '@/hooks/use-autosave';
import { ResumePreview } from './resume-preview';
import { ResumeExportPanel } from './resume-export';

type ArrayKey = 'experience' | 'education' | 'skills' | 'languages' | 'links';
const labels: Record<ResumeSectionKey, string> = {
  personalInfo: 'Personal information',
  summary: 'Professional summary',
  experience: 'Experience',
  education: 'Education',
  skills: 'Skills',
  languages: 'Languages',
  links: 'Links',
};

export function ResumeEditor({ initialResume }: { initialResume: Resume }) {
  const router = useRouter();
  const [title, setTitle] = useState(initialResume.title);
  const [content, setContent] = useState(initialResume.content);
  const [template, setTemplate] = useState(initialResume.template);
  const validation = updateResumeInputSchema.safeParse({ title, content, template });
  const { status, retry, saveLatest, isNavigationSafe } = useAutosave(
    initialResume.id,
    title,
    content,
    template,
  );

  async function returnToDashboard() {
    if (isNavigationSafe || (await saveLatest())) router.push('/');
  }

  function patch(value: Partial<ResumeContent>) {
    setContent((current) => ({ ...current, ...value }));
  }
  function updateItem<K extends ArrayKey>(
    key: K,
    index: number,
    field: keyof ResumeContent[K][number],
    value: string | boolean,
  ) {
    setContent((current) => ({
      ...current,
      [key]: current[key].map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
  }
  function remove(key: ArrayKey, index: number) {
    setContent((current) => ({ ...current, [key]: current[key].filter((_, i) => i !== index) }));
  }
  function move(key: ArrayKey, index: number, offset: -1 | 1) {
    setContent((current) => {
      const items = [...current[key]];
      const target = index + offset;
      if (target < 0 || target >= items.length) return current;
      [items[index], items[target]] = [items[target]!, items[index]!];
      return { ...current, [key]: items };
    });
  }
  function add(key: ArrayKey) {
    const id = crypto.randomUUID();
    const entries = {
      experience: {
        id,
        company: '',
        position: '',
        location: '',
        startDate: '',
        endDate: '',
        current: false,
        description: '',
      },
      education: {
        id,
        institution: '',
        qualification: '',
        field: '',
        startDate: '',
        endDate: '',
        description: '',
      },
      skills: { id, name: '', level: '' },
      languages: { id, name: '', proficiency: '' },
      links: { id, label: '', url: '' },
    };
    setContent((current) => ({ ...current, [key]: [...current[key], entries[key]] }));
  }
  function moveSection(index: number, offset: -1 | 1) {
    const order = [...content.sectionOrder];
    const target = index + offset;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target]!, order[index]!];
    patch({ sectionOrder: order });
  }

  const statusText = {
    saved: 'Saved',
    unsaved: 'Unsaved changes',
    saving: 'Saving',
    failed: 'Save failed',
  }[status];
  return (
    <main className="workspace">
      <header className="editor-topbar">
        <button className="back-link" onClick={() => void returnToDashboard()}>
          ← Resumes
        </button>
        <label>
          Resume title
          <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className={`save-status ${status}`} role="status">
          {statusText}
          {status === 'failed' && <button onClick={retry}>Retry</button>}
        </div>
      </header>
      {!validation.success && (
        <div className="error-banner" role="alert">
          <strong>Check these fields:</strong>
          <ul>
            {validation.error.issues.map((issue) => (
              <li key={`${issue.path.join('.')}-${issue.message}`}>
                {issue.path[0] === 'title' ? 'Resume title' : issue.path.join('.')}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="workspace-columns">
        <div className="editor-panel">
          <fieldset>
            <legend>Template</legend>
            <label>
              Resume template
              <select
                value={template}
                onChange={(event) => setTemplate(event.target.value as typeof template)}
              >
                {resumeTemplateIds.map((id) => (
                  <option key={id} value={id}>
                    {id === 'classic' ? 'Classic' : 'Modern'}
                  </option>
                ))}
              </select>
            </label>
            <ResumeExportPanel resumeId={initialResume.id} saveLatest={saveLatest} />
          </fieldset>
          <fieldset>
            <legend>Section display</legend>
            {content.sectionOrder.map((key, index) => (
              <div className="section-control" key={key}>
                <label>
                  <input
                    type="checkbox"
                    checked={content.sectionVisibility[key]}
                    onChange={(e) =>
                      patch({
                        sectionVisibility: {
                          ...content.sectionVisibility,
                          [key]: e.target.checked,
                        },
                      })
                    }
                  />
                  {labels[key]}
                </label>
                <button
                  aria-label={`Move ${labels[key]} up`}
                  disabled={index === 0}
                  onClick={() => moveSection(index, -1)}
                >
                  ↑
                </button>
                <button
                  aria-label={`Move ${labels[key]} down`}
                  disabled={index === content.sectionOrder.length - 1}
                  onClick={() => moveSection(index, 1)}
                >
                  ↓
                </button>
              </div>
            ))}
          </fieldset>
          <fieldset>
            <legend>Personal information</legend>
            <div className="form-grid">
              {(
                [
                  ['fullName', 'Full name'],
                  ['email', 'Email'],
                  ['phone', 'Phone'],
                  ['location', 'Location'],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    value={content.personalInfo[key]}
                    onChange={(e) =>
                      patch({ personalInfo: { ...content.personalInfo, [key]: e.target.value } })
                    }
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Professional summary</legend>
            <label>
              Summary
              <textarea
                value={content.summary}
                onChange={(e) => patch({ summary: e.target.value })}
              />
            </label>
          </fieldset>
          <Repeatable
            title="Work experience"
            items={content.experience}
            onAdd={() => add('experience')}
            render={(item, index) => (
              <>
                <div className="form-grid">
                  {(
                    [
                      ['position', 'Position'],
                      ['company', 'Company'],
                      ['location', 'Location'],
                      ['startDate', 'Start date'],
                      ['endDate', 'End date'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key}>
                      {label}
                      <input
                        value={item[key]}
                        onChange={(e) => updateItem('experience', index, key, e.target.value)}
                      />
                    </label>
                  ))}
                  <label>
                    <input
                      type="checkbox"
                      checked={item.current}
                      onChange={(e) => updateItem('experience', index, 'current', e.target.checked)}
                    />{' '}
                    Current role
                  </label>
                </div>
                <label>
                  Description
                  <textarea
                    value={item.description}
                    onChange={(e) => updateItem('experience', index, 'description', e.target.value)}
                  />
                </label>
                <ItemControls
                  title="experience"
                  index={index}
                  count={content.experience.length}
                  move={(o) => move('experience', index, o)}
                  remove={() => remove('experience', index)}
                />
              </>
            )}
          />
          <Repeatable
            title="Education"
            items={content.education}
            onAdd={() => add('education')}
            render={(item, index) => (
              <>
                <div className="form-grid">
                  {(
                    [
                      ['institution', 'Institution'],
                      ['qualification', 'Qualification'],
                      ['field', 'Field of study'],
                      ['startDate', 'Start date'],
                      ['endDate', 'End date'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key}>
                      {label}
                      <input
                        value={item[key]}
                        onChange={(e) => updateItem('education', index, key, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
                <label>
                  Description
                  <textarea
                    value={item.description}
                    onChange={(e) => updateItem('education', index, 'description', e.target.value)}
                  />
                </label>
                <ItemControls
                  title="education"
                  index={index}
                  count={content.education.length}
                  move={(o) => move('education', index, o)}
                  remove={() => remove('education', index)}
                />
              </>
            )}
          />
          <SimpleItems
            title="Skills"
            items={content.skills}
            fields={[
              ['name', 'Skill'],
              ['level', 'Level'],
            ]}
            add={() => add('skills')}
            update={(i, k, v) => updateItem('skills', i, k as 'name' | 'level', v)}
            move={(i, o) => move('skills', i, o)}
            remove={(i) => remove('skills', i)}
          />
          <SimpleItems
            title="Languages"
            items={content.languages}
            fields={[
              ['name', 'Language'],
              ['proficiency', 'Proficiency'],
            ]}
            add={() => add('languages')}
            update={(i, k, v) => updateItem('languages', i, k as 'name' | 'proficiency', v)}
            move={(i, o) => move('languages', i, o)}
            remove={(i) => remove('languages', i)}
          />
          <SimpleItems
            title="Links"
            items={content.links}
            fields={[
              ['label', 'Label'],
              ['url', 'URL'],
            ]}
            add={() => add('links')}
            update={(i, k, v) => updateItem('links', i, k as 'label' | 'url', v)}
            move={(i, o) => move('links', i, o)}
            remove={(i) => remove('links', i)}
          />
        </div>
        <aside className="preview-panel">
          <ResumePreview content={content} template={template} />
        </aside>
      </div>
    </main>
  );
}

function Repeatable<T>({
  title,
  items,
  onAdd,
  render,
}: {
  title: string;
  items: T[];
  onAdd: () => void;
  render: (item: T, index: number) => React.ReactNode;
}) {
  return (
    <fieldset>
      <legend>{title}</legend>
      {items.map((item, index) => (
        <div className="repeatable" key={(item as { id: string }).id}>
          {render(item, index)}
        </div>
      ))}
      <button className="secondary" onClick={onAdd}>
        Add {title.toLowerCase()}
      </button>
    </fieldset>
  );
}
function ItemControls({
  title,
  index,
  count,
  move,
  remove,
}: {
  title: string;
  index: number;
  count: number;
  move: (o: -1 | 1) => void;
  remove: () => void;
}) {
  return (
    <div className="item-controls">
      <button disabled={index === 0} onClick={() => move(-1)}>
        Move up
      </button>
      <button disabled={index === count - 1} onClick={() => move(1)}>
        Move down
      </button>
      <button className="danger" aria-label={`Remove ${title}`} onClick={remove}>
        Remove
      </button>
    </div>
  );
}
function SimpleItems({
  title,
  items,
  fields,
  add,
  update,
  move,
  remove,
}: {
  title: string;
  items: Array<{ id: string } & Record<string, string>>;
  fields: readonly (readonly [string, string])[];
  add: () => void;
  update: (i: number, k: string, v: string) => void;
  move: (i: number, o: -1 | 1) => void;
  remove: (i: number) => void;
}) {
  return (
    <Repeatable
      title={title}
      items={items}
      onAdd={add}
      render={(item, index) => (
        <>
          <div className="form-grid">
            {fields.map(([key, label]) => (
              <label key={key}>
                {label}
                <input value={item[key]} onChange={(e) => update(index, key, e.target.value)} />
              </label>
            ))}
          </div>
          <ItemControls
            title={title.toLowerCase()}
            index={index}
            count={items.length}
            move={(o) => move(index, o)}
            remove={() => remove(index)}
          />
        </>
      )}
    />
  );
}
