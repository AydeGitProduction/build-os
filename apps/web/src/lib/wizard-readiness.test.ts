// apps/web/src/lib/wizard-readiness.test.ts
/**
 * Unit tests for the wizard readiness scoring algorithm.
 * Run with: pnpm test wizard-readiness
 */

import {
  calculateReadiness,
  normaliseQuestionnaireAnswers,
  REQUIRED_FIELDS,
  isReadyForBlueprint,
  READINESS_THRESHOLD,
} from './wizard-readiness';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a CollectedFields object with all 7 fields, each with sufficient length */
function allFieldsFull() {
  return {
    product_name:    'MyApp',
    target_audience: 'Small business owners who need invoicing',
    core_problem:    'Manual invoicing is slow and error-prone for freelancers',
    key_features:    'Automated invoicing, PDF export, payment tracking',
    monetisation:    'SaaS',
    timeline_weeks:  '12',
    budget_usd:      '5000',
  };
}

// ---------------------------------------------------------------------------
// Acceptance criteria tests
// ---------------------------------------------------------------------------

describe('calculateReadiness — acceptance criteria', () => {
  test('AC1: Empty project returns readiness=0, all fields missing', () => {
    const result = calculateReadiness(null);
    expect(result.readiness).toBe(0);
    expect(result.missing_fields).toHaveLength(7);
    expect(result.missing_fields).toEqual(REQUIRED_FIELDS.map((f) => f.key));
    expect(result.collected_count).toBe(0);
    expect(result.total_fields).toBe(7);
  });

  test('AC2: product_name + target_audience + core_problem → readiness=60', () => {
    const fields = {
      product_name:    'MyApp',
      target_audience: 'Small business owners who need invoicing',
      core_problem:    'Manual invoicing is slow and error-prone for freelancers',
    };
    const result = calculateReadiness(fields);
    // 15 + 20 + 25 = 60, no bonus (not > 80)
    expect(result.readiness).toBe(60);
    expect(result.missing_fields).toContain('key_features');
    expect(result.missing_fields).toContain('monetisation');
    expect(result.missing_fields).toContain('timeline_weeks');
    expect(result.missing_fields).toContain('budget_usd');
    expect(result.missing_fields).not.toContain('product_name');
    expect(result.collected_count).toBe(3);
  });

  test('AC3: All 7 fields with sufficient length → readiness >= 90', () => {
    const result = calculateReadiness(allFieldsFull());
    expect(result.readiness).toBeGreaterThanOrEqual(90);
    expect(result.readiness).toBeLessThanOrEqual(100);
    expect(result.missing_fields).toHaveLength(0);
    expect(result.collected_count).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Scoring precision
// ---------------------------------------------------------------------------

describe('calculateReadiness — scoring precision', () => {
  test('weights sum to 100', () => {
    const sum = REQUIRED_FIELDS.reduce((acc, f) => acc + f.weight, 0);
    expect(sum).toBe(100);
  });

  test('all 7 fields present with confidence bonus → readiness=100', () => {
    const result = calculateReadiness(allFieldsFull());
    // fieldScore = 100, bonus = 5 → capped at 100
    expect(result.readiness).toBe(100);
  });

  test('no confidence bonus when score <= 80', () => {
    // Only 3 fields: score = 60, no bonus
    const fields = {
      product_name:    'MyApp',
      target_audience: 'Small business owners who need invoicing',
      core_problem:    'Manual invoicing is slow and error-prone for freelancers',
    };
    const result = calculateReadiness(fields);
    expect(result.readiness).toBe(60); // exactly 60, no bonus
  });

  test('confidence bonus requires score > 80 AND all high-weight fields', () => {
    // score = 85 (all except monetisation=10 and timeline=5 → 85)
    // But missing high-weight field 'monetisation' (weight=10 is in high-weight set)
    const fields = {
      product_name:    'MyApp',
      target_audience: 'Small business owners who need invoicing',
      core_problem:    'Manual invoicing is slow and error-prone for freelancers',
      key_features:    'Automated invoicing, PDF export, payment tracking',
      timeline_weeks:  '12',
      budget_usd:      '5000',
      // monetisation missing
    };
    const result = calculateReadiness(fields);
    // 15+20+25+20+5+5 = 90, but monetisation missing so no bonus
    expect(result.readiness).toBe(90); // no bonus because monetisation missing
    expect(result.missing_fields).toContain('monetisation');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('calculateReadiness — edge cases', () => {
  test('empty string field treated as not collected', () => {
    const fields = {
      product_name: '',   // empty string
      target_audience: 'Small business owners who need invoicing',
      core_problem: 'Manual invoicing is slow and error-prone for freelancers',
    };
    const result = calculateReadiness(fields);
    // Only target_audience (20) + core_problem (25) = 45
    expect(result.readiness).toBe(45);
    expect(result.missing_fields).toContain('product_name');
  });

  test('field present but below minLength treated as not collected', () => {
    const fields = {
      product_name:    'AB',  // length 2, minLength is 3
      target_audience: 'Hi',  // length 2, minLength is 10
      core_problem:    'Problem',  // length 7, minLength is 20
    };
    const result = calculateReadiness(fields);
    expect(result.readiness).toBe(0);
    expect(result.missing_fields).toHaveLength(7);
  });

  test('exactly at minLength boundary counts as collected', () => {
    const fields = {
      product_name: 'App',  // exactly 3 chars = minLength 3 ✓
    };
    const result = calculateReadiness(fields);
    expect(result.field_scores.find((f) => f.key === 'product_name')?.earned).toBe(15);
  });

  test('null collected_fields (no DB row) → readiness=0', () => {
    const result = calculateReadiness(null);
    expect(result.readiness).toBe(0);
  });

  test('undefined collected_fields → readiness=0', () => {
    const result = calculateReadiness(undefined);
    expect(result.readiness).toBe(0);
  });

  test('null value for a field key → treated as not collected', () => {
    const fields = {
      product_name: null,  // explicit null
      target_audience: 'Small business owners who need invoicing',
    };
    const result = calculateReadiness(fields as any);
    expect(result.missing_fields).toContain('product_name');
    expect(result.readiness).toBe(20); // only target_audience
  });

  test('readiness never exceeds 100', () => {
    const result = calculateReadiness(allFieldsFull());
    expect(result.readiness).toBeLessThanOrEqual(100);
  });

  test('missing_fields only lists uncollected fields', () => {
    const fields = {
      product_name:    'MyApp',
      target_audience: 'Small business owners who need invoicing',
    };
    const result = calculateReadiness(fields);
    expect(result.missing_fields).not.toContain('product_name');
    expect(result.missing_fields).not.toContain('target_audience');
    expect(result.missing_fields).toContain('core_problem');
    expect(result.missing_fields).toContain('key_features');
    expect(result.missing_fields).toContain('monetisation');
    expect(result.missing_fields).toContain('timeline_weeks');
    expect(result.missing_fields).toContain('budget_usd');
  });

  test('extra fields in collected_fields are ignored', () => {
    const fields = {
      ...allFieldsFull(),
      some_unknown_field: 'extra data that should not affect score',
      another_extra: 'more extra',
    };
    const result = calculateReadiness(fields);
    expect(result.readiness).toBe(100);
    expect(result.total_fields).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// isReadyForBlueprint
// ---------------------------------------------------------------------------

describe('isReadyForBlueprint', () => {
  test(`returns true when readiness >= ${READINESS_THRESHOLD}`, () => {
    expect(isReadyForBlueprint(80)).toBe(true);
    expect(isReadyForBlueprint(95)).toBe(true);
    expect(isReadyForBlueprint(100)).toBe(true);
  });

  test(`returns false when readiness < ${READINESS_THRESHOLD}`, () => {
    expect(isReadyForBlueprint(79)).toBe(false);
    expect(isReadyForBlueprint(60)).toBe(false);
    expect(isReadyForBlueprint(0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// normaliseQuestionnaireAnswers
// ---------------------------------------------------------------------------

describe('normaliseQuestionnaireAnswers', () => {
  test('maps canonical keys directly', () => {
    const answers = {
      product_name: 'MyApp',
      core_problem: 'The problem statement here that is long enough',
    };
    const result = normaliseQuestionnaireAnswers(answers);
    expect(result.product_name).toBe('MyApp');
    expect(result.core_problem).toBe('The problem statement here that is long enough');
  });

  test('maps legacy aliases', () => {
    const answers = {
      app_name: 'MyApp',
      audience: 'Small business owners who need invoicing',
      problem: 'Manual invoicing is slow and error-prone for freelancers',
      features: 'Automated invoicing, PDF export',
      monetization: 'SaaS',
      timeline: '12',
      budget: '5000',
    };
    const result = normaliseQuestionnaireAnswers(answers);
    expect(result.product_name).toBe('MyApp');
    expect(result.target_audience).toBe('Small business owners who need invoicing');
    expect(result.core_problem).toBe('Manual invoicing is slow and error-prone for freelancers');
    expect(result.key_features).toBe('Automated invoicing, PDF export');
    expect(result.monetisation).toBe('SaaS');
    expect(result.timeline_weeks).toBe('12');
    expect(result.budget_usd).toBe('5000');
  });

  test('canonical key wins over alias when both present', () => {
    const answers = {
      product_name: 'CanonicalName',
      app_name: 'AliasName',
    };
    const result = normaliseQuestionnaireAnswers(answers);
    expect(result.product_name).toBe('CanonicalName');
  });

  test('handles null/undefined input gracefully', () => {
    expect(normaliseQuestionnaireAnswers(null)).toEqual({});
    expect(normaliseQuestionnaireAnswers(undefined)).toEqual({});
    expect(normaliseQuestionnaireAnswers({} as any)).toEqual({});
  });

  test('converts non-string values to strings', () => {
    const answers = {
      timeline_weeks: 12,   // number
      budget_usd: 5000,     // number
    };
    const result = normaliseQuestionnaireAnswers(answers as any);
    expect(result.timeline_weeks).toBe('12');
    expect(result.budget_usd).toBe('5000');
  });
});

// ---------------------------------------------------------------------------
// Full integration-style scoring scenarios
// ---------------------------------------------------------------------------

describe('calculateReadiness — scenario table', () => {
  const scenarios: Array<{
    label: string;
    fields: Record<string, string> | null;
    expectedReadiness: number;
    expectedCollected: number;
  }> = [
    {
      label: 'No data',
      fields: null,
      expectedReadiness: 0,
      expectedCollected: 0,
    },
    {
      label: 'Only product_name (valid)',
      fields: { product_name: 'MyApp' },
      expectedReadiness: 15,
      expectedCollected: 1,
    },
    {
      label: 'product_name + target_audience',
      fields: {
        product_name: 'MyApp',
        target_audience: 'Small business owners needing invoicing',
      },
      expectedReadiness: 35, // 15+20
      expectedCollected: 2,
    },
    {
      label: 'product_name + target_audience + core_problem',
      fields: {
        product_name: 'MyApp',
        target_audience: 'Small business owners needing invoicing',
        core_problem: 'Manual invoicing is slow and error-prone for freelancers',
      },
      expectedReadiness: 60, // 15+20+25
      expectedCollected: 3,
    },
    {
      label: 'All 7 fields',
      fields: allFieldsFull(),
      expectedReadiness: 100, // 100 + 5 bonus, capped at 100
      expectedCollected: 7,
    },
  ];

  test.each(scenarios)(
    '$label → readiness=$expectedReadiness, collected=$expectedCollected',
    ({ fields, expectedReadiness, expectedCollected }) => {
      const result = calculateReadiness(fields);
      expect(result.readiness).toBe(expectedReadiness);
      expect(result.collected_count).toBe(expectedCollected);
    },
  );
});