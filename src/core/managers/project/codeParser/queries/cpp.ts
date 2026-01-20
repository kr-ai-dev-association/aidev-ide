/*
C++ 정의 쿼리:
- function definitions
- class declarations
- struct declarations
- enum declarations
- namespace definitions
- template declarations
*/
export default `
(function_definition
  declarator: (function_declarator
    declarator: (identifier) @name.definition.function)) @definition.function

(class_specifier
  name: (type_identifier) @name.definition.class) @definition.class

(struct_specifier
  name: (type_identifier) @name.definition.class) @definition.class

(enum_specifier
  name: (type_identifier) @name.definition.enum) @definition.enum

(namespace_definition
  name: (identifier) @name.definition.module) @definition.module

(template_declaration
  (function_definition
    declarator: (function_declarator
      declarator: (identifier) @name.definition.function))) @definition.function
`;
