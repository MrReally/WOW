const MAX_EXPRESSION_LENGTH = 120;
const MAX_OPERATIONS = 50;
const MAX_AMOUNT = 1_000_000_000_000;

/**
 * Evaluate the deliberately small arithmetic language accepted by the
 * Telegram transaction flow. This is a parser, not eval: only decimal
 * numbers, parentheses and + - * / are understood.
 */
export function evaluateTelegramAmount(expression: string): number {
  const source = expression.trim().replace(/,/g, ".");
  if (!source || source.length > MAX_EXPRESSION_LENGTH) throw new Error("Некорректное выражение");
  if (!/^[0-9+\-*/().\s]+$/.test(source)) throw new Error("Разрешены только числа, скобки и знаки + − × ÷");

  let index = 0;
  let operations = 0;
  const skipSpace = () => { while (/\s/.test(source[index] ?? "")) index += 1; };
  const checked = (value: number): number => {
    if (!Number.isFinite(value) || Math.abs(value) >= MAX_AMOUNT) throw new Error("Результат слишком большой");
    return value;
  };
  const operation = (value: number): number => {
    operations += 1;
    if (operations > MAX_OPERATIONS) throw new Error("Слишком сложное выражение");
    return checked(value);
  };

  const parseNumber = (): number => {
    skipSpace();
    const match = source.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (!match) throw new Error("Ожидалось число");
    index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) throw new Error("Некорректное число");
    return value;
  };

  let parseExpression: () => number;
  const parsePrimary = (): number => {
    skipSpace();
    const char = source[index];
    if (char === "+" || char === "-") {
      index += 1;
      const value = parsePrimary();
      return char === "-" ? operation(-value) : value;
    }
    if (char === "(") {
      index += 1;
      const value = parseExpression();
      skipSpace();
      if (source[index] !== ")") throw new Error("Не закрыта скобка");
      index += 1;
      return value;
    }
    return parseNumber();
  };
  const parseTerm = (): number => {
    let value = parsePrimary();
    while (true) {
      skipSpace();
      const operator = source[index];
      if (operator !== "*" && operator !== "/") return value;
      index += 1;
      const right = parsePrimary();
      if (operator === "/" && right === 0) throw new Error("На ноль делить нельзя");
      value = operation(operator === "*" ? value * right : value / right);
    }
  };
  parseExpression = (): number => {
    let value = parseTerm();
    while (true) {
      skipSpace();
      const operator = source[index];
      if (operator !== "+" && operator !== "-") return value;
      index += 1;
      const right = parseTerm();
      value = operation(operator === "+" ? value + right : value - right);
    }
  };

  const result = parseExpression();
  skipSpace();
  if (index !== source.length) throw new Error("Некорректное выражение");
  const rounded = Math.round((result + Number.EPSILON) * 100) / 100;
  if (rounded <= 0) throw new Error("Сумма должна быть больше нуля");
  return checked(rounded);
}
