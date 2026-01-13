/*
Python 정의 쿼리:
- function definitions
- class definitions
- async function definitions
*/
export default `
(function_definition
  name: (identifier) @name.definition.function) @definition.function

(class_definition
  name: (identifier) @name.definition.class) @definition.class
`;

