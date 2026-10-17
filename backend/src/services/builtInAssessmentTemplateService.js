const catalog = require("../data/builtInAssessmentTemplates.v1");

const clone = (value) => JSON.parse(JSON.stringify(value));

const summary = (template) => ({
  templateKey: template.templateKey,
  templateVersion: template.templateVersion,
  curriculumRevision: template.curriculumRevision,
  lessonKey: template.lessonKey,
  lessonTitle: template.lessonTitle,
  type: template.type,
  questionCount: template.questions.length,
  totalPoints: template.questions.reduce((sum, question) => sum + Number(question.points), 0),
});

const listTemplates = () => ({
  catalogVersion: catalog.catalogVersion,
  curriculumRevision: catalog.curriculumRevision,
  templates: catalog.templates.map(summary),
});

const resolveTemplate = ({ templateKey, templateVersion }) => {
  const found = catalog.templates.find((template) => (
    template.templateKey === templateKey
    && template.templateVersion === templateVersion
  ));
  return found ? clone(found) : null;
};

module.exports = { listTemplates, resolveTemplate };
