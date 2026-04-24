import { Question } from './types';

/**
 * Orders questions for display:
 * - Pinned questions first (in their original relative order)
 * - Approved questions after, sorted by upvoteCount DESC, then submittedAt ASC for ties
 *
 * Pure function — no mutations, no side effects.
 */
export function orderQuestions(questions: Question[]): Question[] {
  const pinned = questions.filter(q => q.status === 'pinned');
  const approved = questions
    .filter(q => q.status === 'approved')
    .sort((a, b) => {
      if (b.upvoteCount !== a.upvoteCount) {
        return b.upvoteCount - a.upvoteCount;
      }
      return a.submittedAt.getTime() - b.submittedAt.getTime();
    });

  return [...pinned, ...approved];
}
