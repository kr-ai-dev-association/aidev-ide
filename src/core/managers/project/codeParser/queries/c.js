/*
C 정의 쿼리:
- function definitions
- struct declarations
- enum declarations
- type definitions (typedef)
*/
export default `
(function_definition
  declarator: (function_declarator
    declarator: (identifier) @name.definition.function)) @definition.function

(struct_specifier
  name: (type_identifier) @name.definition.class) @definition.class

(enum_specifier
  name: (type_identifier) @name.definition.enum) @definition.enum

(type_definition
  declarator: (type_identifier) @name.definition.type) @definition.type
`;
//# sourceMappingURL=c.js.map