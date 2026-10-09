import { renderHome } from './home.js';
import { renderEcho } from './echo.js';
import { renderCalculators } from './calculators.js';
import { renderConclusion } from './conclusion.js';
import { renderAssistant } from './assistant.js';
import { renderQuestions } from './questions.js';
import { renderPlans } from './plans.js';
import { renderAccount } from './account.js';
import { renderAdmin } from './admin.js';

export const VIEWS = {
  home: renderHome,
  echo: renderEcho,
  calculators: renderCalculators,
  conclusion: renderConclusion,
  assistant: renderAssistant,
  questions: renderQuestions,
  plans: renderPlans,
  account: renderAccount,
  admin: renderAdmin,
};
