/*
Go 정의 쿼리:
- function declarations
- method declarations
- type declarations (struct, interface)
*/
export default `
(function_declaration
  name: (identifier) @name.definition.function) @definition.function

(method_declaration
  name: (field_identifier) @name.definition.method) @definition.method

(type_declaration
  (type_spec
    name: (type_identifier) @name.definition.type)) @definition.type
`;
