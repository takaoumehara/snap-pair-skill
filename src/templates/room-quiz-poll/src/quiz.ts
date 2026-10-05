/** Shared room state (owned by the host, mirrored to every phone). */
export interface QuizState {
  questionId: string;
  question: string;
  choices: string[];
  open: boolean;
  tally: number[];
}

/** `vote` payload (controller -> host). */
export interface Vote {
  questionId: string;
  choice: number;
}

export const QUESTIONS: Array<Pick<QuizState, 'question' | 'choices'>> = [
  { question: 'Which device are you using right now?', choices: ['iPhone', 'Android', 'Tablet', 'Something else'] },
  { question: 'How many screens are in this room?', choices: ['1', '2–5', '6–20', 'More than 20'] },
  { question: 'Ready for the next part?', choices: ['Yes!', 'Give me a minute'] },
];

export function questionState(index: number): QuizState {
  const { question, choices } = QUESTIONS[index % QUESTIONS.length];
  return { questionId: `q${index}`, question, choices, open: true, tally: choices.map(() => 0) };
}

export const INITIAL_STATE: QuizState = questionState(0);
