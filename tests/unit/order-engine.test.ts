import { orderQuestions } from '../../src/order-engine';
import { Question } from '../../src/types';

function makeQuestion(overrides: Partial<Question> & { id: string }): Question {
  return {
    sessionId: 'session-1',
    participantId: 'participant-1',
    text: 'A question',
    status: 'approved',
    upvoteCount: 0,
    submittedAt: new Date('2024-01-01T10:00:00Z'),
    lastModifiedAt: new Date('2024-01-01T10:00:00Z'),
    ...overrides,
  };
}

describe('orderQuestions', () => {
  it('returns empty array for empty input', () => {
    expect(orderQuestions([])).toEqual([]);
  });

  it('places pinned questions before approved questions', () => {
    const approved = makeQuestion({ id: 'a1', status: 'approved', upvoteCount: 10 });
    const pinned = makeQuestion({ id: 'p1', status: 'pinned', upvoteCount: 0 });

    const result = orderQuestions([approved, pinned]);
    expect(result[0].id).toBe('p1');
    expect(result[1].id).toBe('a1');
  });

  it('sorts approved questions by upvoteCount descending', () => {
    const low = makeQuestion({ id: 'low', status: 'approved', upvoteCount: 1 });
    const high = makeQuestion({ id: 'high', status: 'approved', upvoteCount: 5 });
    const mid = makeQuestion({ id: 'mid', status: 'approved', upvoteCount: 3 });

    const result = orderQuestions([low, high, mid]);
    expect(result.map(q => q.id)).toEqual(['high', 'mid', 'low']);
  });

  it('breaks upvote ties by submittedAt ascending', () => {
    const later = makeQuestion({
      id: 'later',
      status: 'approved',
      upvoteCount: 5,
      submittedAt: new Date('2024-01-01T12:00:00Z'),
    });
    const earlier = makeQuestion({
      id: 'earlier',
      status: 'approved',
      upvoteCount: 5,
      submittedAt: new Date('2024-01-01T10:00:00Z'),
    });

    const result = orderQuestions([later, earlier]);
    expect(result.map(q => q.id)).toEqual(['earlier', 'later']);
  });

  it('filters out pending, rejected, and answered questions', () => {
    const pending = makeQuestion({ id: 'pending', status: 'pending' });
    const rejected = makeQuestion({ id: 'rejected', status: 'rejected' });
    const answered = makeQuestion({ id: 'answered', status: 'answered' });
    const approved = makeQuestion({ id: 'approved', status: 'approved' });
    const pinned = makeQuestion({ id: 'pinned', status: 'pinned' });

    const result = orderQuestions([pending, rejected, answered, approved, pinned]);
    const ids = result.map(q => q.id);
    expect(ids).not.toContain('pending');
    expect(ids).not.toContain('rejected');
    expect(ids).not.toContain('answered');
    expect(ids).toContain('approved');
    expect(ids).toContain('pinned');
  });

  it('does not mutate the input array', () => {
    const q1 = makeQuestion({ id: 'q1', status: 'approved', upvoteCount: 1 });
    const q2 = makeQuestion({ id: 'q2', status: 'approved', upvoteCount: 5 });
    const input = [q1, q2];
    const inputCopy = [...input];

    orderQuestions(input);

    expect(input).toEqual(inputCopy);
  });

  it('handles multiple pinned questions preserving their relative order', () => {
    const p1 = makeQuestion({ id: 'p1', status: 'pinned', upvoteCount: 0 });
    const p2 = makeQuestion({ id: 'p2', status: 'pinned', upvoteCount: 10 });
    const a1 = makeQuestion({ id: 'a1', status: 'approved', upvoteCount: 3 });

    const result = orderQuestions([p1, p2, a1]);
    expect(result[0].id).toBe('p1');
    expect(result[1].id).toBe('p2');
    expect(result[2].id).toBe('a1');
  });

  it('returns only pinned when no approved questions exist', () => {
    const p1 = makeQuestion({ id: 'p1', status: 'pinned' });
    const result = orderQuestions([p1]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p1');
  });

  it('returns only approved when no pinned questions exist', () => {
    const a1 = makeQuestion({ id: 'a1', status: 'approved', upvoteCount: 2 });
    const a2 = makeQuestion({ id: 'a2', status: 'approved', upvoteCount: 5 });
    const result = orderQuestions([a1, a2]);
    expect(result[0].id).toBe('a2');
    expect(result[1].id).toBe('a1');
  });
});
