export function gradeAnswer(quiz, answerId) {
  if (!quiz.options.some((option) => option.id === answerId)) {
    throw new RangeError('Unknown quiz option');
  }
  return {
    correct: answerId === quiz.answer,
    correctOption: quiz.options.find((option) => option.id === quiz.answer),
    explanation: quiz.explanation,
  };
}

export function formatFormula(formula) {
  const subscripts = '₀₁₂₃₄₅₆₇₈₉';
  return formula.replace(/[0-9]/g, (digit) => subscripts[Number(digit)]);
}
