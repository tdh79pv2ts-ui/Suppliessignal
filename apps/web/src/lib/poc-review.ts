export const reviewScoreOptions = ['CORRECT','PARTIALLY_CORRECT','INCORRECT','NOT_APPLICABLE'] as const;
export const failureReasonOptions = ['HALLUCINATION','MISINTERPRETATION','NEGATION_ERROR','FORECAST_OBSERVED_ERROR','DATE_ERROR','ENTITY_ERROR','LOCATION_ERROR','CLAIM_TOO_BROAD','CLAIM_TOO_FRAGMENTED','MISSING_CLAIM','IRRELEVANT_CLAIM','INSUFFICIENT_ARTICLE_TEXT','TRUNCATION','SOURCE_AMBIGUITY','OTHER'] as const;
export type ReviewScore = typeof reviewScoreOptions[number];
export type ReviewDimension = 'claimScore'|'evidenceScore'|'entityScore'|'locationScore'|'dateScore'|'assertionScore';
export type StoredClaimEvaluation = Partial<Record<ReviewDimension,ReviewScore>> & {unsupported?:boolean;failureReason?:string|null;notes?:string|null};
export type ClaimReviewState = Record<ReviewDimension,ReviewScore> & {unsupported:boolean;failureReason:string|null;notes:string|null};

export function initializeClaimReview(evaluation?:StoredClaimEvaluation):ClaimReviewState{return{
  claimScore:evaluation?.claimScore??'CORRECT',evidenceScore:evaluation?.evidenceScore??'CORRECT',entityScore:evaluation?.entityScore??'CORRECT',locationScore:evaluation?.locationScore??'CORRECT',dateScore:evaluation?.dateScore??'CORRECT',assertionScore:evaluation?.assertionScore??'CORRECT',unsupported:evaluation?.unsupported??false,failureReason:evaluation?.failureReason??null,notes:evaluation?.notes??null,
};}
