import {
  resumeContentSchema,
  resumeTemplateIdSchema,
  type ResumeContent,
  type ResumeSectionKey,
  type ResumeTemplateId,
} from '@cv-builder/resume-schema';

export interface ResumeRenderInput {
  readonly title: string;
  readonly content: ResumeContent;
  readonly template: ResumeTemplateId;
}

const escape = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character]!;
  });
const compact = (values: string[], separator = ' · '): string =>
  values.filter(Boolean).map(escape).join(separator);
const range = (start: string, end: string, current = false): string =>
  compact([start, current ? 'Present' : end], ' – ');
const paragraphs = (value: string): string =>
  value
    .split(/\n+/)
    .filter(Boolean)
    .map((line) => `<p>${escape(line)}</p>`)
    .join('');
const section = (title: string, body: string): string =>
  body ? `<section><h2>${title}</h2>${body}</section>` : '';

function renderSections(content: ResumeContent): Record<ResumeSectionKey, string> {
  const personal = content.personalInfo;
  return {
    personalInfo: `<header><h1>${escape(personal.fullName || 'Your name')}</h1><p class="contact">${compact([personal.email, personal.phone, personal.location])}</p></header>`,
    summary: section('Profile', paragraphs(content.summary)),
    experience: section(
      'Experience',
      content.experience
        .map(
          (item) =>
            `<article><div class="row"><h3>${compact([item.position || 'Position', item.company])}</h3><span>${range(item.startDate, item.endDate, item.current)}</span></div>${item.location ? `<p class="muted">${escape(item.location)}</p>` : ''}${paragraphs(item.description)}</article>`,
        )
        .join(''),
    ),
    education: section(
      'Education',
      content.education
        .map(
          (item) =>
            `<article><div class="row"><h3>${compact([item.qualification || item.field || 'Qualification', item.institution])}</h3><span>${range(item.startDate, item.endDate)}</span></div>${paragraphs(item.description)}</article>`,
        )
        .join(''),
    ),
    skills: section(
      'Skills',
      content.skills.length
        ? `<p>${content.skills
            .map((item) => compact([item.name, item.level], ' — '))
            .filter(Boolean)
            .join(' · ')}</p>`
        : '',
    ),
    languages: section(
      'Languages',
      content.languages.length
        ? `<p>${content.languages
            .map((item) => compact([item.name, item.proficiency], ' — '))
            .filter(Boolean)
            .join(' · ')}</p>`
        : '',
    ),
    links: section(
      'Links',
      content.links.length
        ? `<ul>${content.links.map((item) => `<li>${compact([item.label || item.url, item.label ? item.url : ''], ': ')}</li>`).join('')}</ul>`
        : '',
    ),
  };
}

const baseCss = `
  :root{font-family:"Noto Sans",Arial,sans-serif;color:#172033;background:#fff}
  *{box-sizing:border-box}body{margin:0;background:#fff}.resume-document{width:210mm;min-height:297mm;margin:0 auto;padding:16mm 17mm;font-size:10.5pt;line-height:1.45}
  h1,h2,h3,p{margin:0}h1{font-size:25pt;line-height:1.15}h2{font-size:12pt;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4mm}h3{font-size:10.5pt}header{margin-bottom:8mm}.contact{margin-top:2mm;color:#4b5563}
  section{margin-bottom:6mm}article{break-inside:avoid;margin-bottom:4mm}.row{display:flex;justify-content:space-between;gap:8mm;align-items:baseline}.row span{white-space:nowrap;color:#4b5563}.muted{color:#667085}ul{margin:0;padding-left:5mm}p{white-space:pre-wrap;overflow-wrap:anywhere}
  @page{size:A4;margin:0}@media(max-width:800px){.resume-document{width:100%;min-height:auto;padding:7vw}.row{display:block}.row span{white-space:normal}}
`;
const templateCss: Record<ResumeTemplateId, string> = {
  classic: `h1{font-family:Georgia,"Noto Serif",serif}h2{font-family:Georgia,"Noto Serif",serif;border-bottom:1px solid #8b95a5;padding-bottom:1.5mm}`,
  modern: `.resume-document{border-top:8mm solid #155e75;padding-top:12mm}header{padding-bottom:5mm;border-bottom:2px solid #155e75}h1{color:#155e75}h2{color:#155e75;border-left:3px solid #155e75;padding-left:3mm}.contact{color:#334155}`,
};

export function renderResumeMarkup(input: ResumeRenderInput): string {
  const content = resumeContentSchema.parse(input.content);
  const template = resumeTemplateIdSchema.parse(input.template);
  const sections = renderSections(content);
  const body = content.sectionOrder
    .filter((key) => content.sectionVisibility[key])
    .map((key) => sections[key])
    .join('');
  return `<article class="resume-document template-${template}" aria-label="Resume preview">${body}</article>`;
}

export function renderResumeHtml(input: ResumeRenderInput): string {
  const template = resumeTemplateIdSchema.parse(input.template);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(input.title)}</title><style>${baseCss}${templateCss[template]}</style></head><body>${renderResumeMarkup(input)}</body></html>`;
}

export function resumeTemplateStyles(template: ResumeTemplateId): string {
  return `${baseCss}${templateCss[resumeTemplateIdSchema.parse(template)]}`;
}
