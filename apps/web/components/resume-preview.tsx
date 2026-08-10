import type { ResumeContent, ResumeTemplateId } from '@cv-builder/resume-schema';
import { renderResumeMarkup, resumeTemplateStyles } from '@cv-builder/templates';

export function ResumePreview({
  content,
  template,
}: {
  content: ResumeContent;
  template: ResumeTemplateId;
}) {
  const markup = renderResumeMarkup({ title: 'Resume preview', content, template });
  return (
    <div className="a4-preview" aria-label="Live resume preview">
      <style>{resumeTemplateStyles(template)}</style>
      <div dangerouslySetInnerHTML={{ __html: markup }} />
    </div>
  );
}
