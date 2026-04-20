import type { AnalysisResult, RemediationResult, ScoredCategory } from '../../types.js';

type ApiCategory = Omit<ScoredCategory, 'weight' | 'score'> & { score: number | null };
type ApiAnalysisResult = Omit<AnalysisResult, 'score' | 'grade' | 'categories'> & {
  categories: ApiCategory[];
};
type ApiRemediationResult = Omit<RemediationResult, 'before' | 'after'> & {
  before: ApiAnalysisResult;
  after: ApiAnalysisResult;
};

function serializeCategory(category: ScoredCategory): ApiCategory {
  const { weight: _weight, ...rest } = category;
  return {
    ...rest,
    score: category.key === 'color_contrast' ? null : category.score,
  };
}

export function toApiAnalysisResult(result: AnalysisResult): ApiAnalysisResult {
  const { score: _score, grade: _grade, categories, ...rest } = result;
  return {
    ...rest,
    categories: categories.map(serializeCategory),
  };
}

export function toApiRemediationResult(result: RemediationResult): ApiRemediationResult {
  return {
    ...result,
    before: toApiAnalysisResult(result.before),
    after: toApiAnalysisResult(result.after),
  };
}
