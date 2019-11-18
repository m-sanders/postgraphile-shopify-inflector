function fixCapitalisedPlural(fn) {
  return function(str) {
    const original = fn.call(this, str);
    return original.replace(/[0-9]S(?=[A-Z]|$)/g, match => match.toLowerCase());
  };
}

function fixChangePlural(fn) {
  return function(str) {
    const matches = str.match(/([A-Z]|_[a-z0-9])[a-z0-9]*_*$/);
    const index = matches ? matches.index + matches[1].length - 1 : 0;
    const suffixMatches = str.match(/_*$/);
    const suffixIndex = suffixMatches.index;
    const prefix = str.substr(0, index);
    const word = str.substr(index, suffixIndex - index);
    const suffix = str.substr(suffixIndex);
    return `${prefix}${fn.call(this, word)}${suffix}`;
  };
}

function PgShopifyInflectorPlugin(builder, { nodeIdFieldName = "nodeId" }) {
  builder.hook("inflection", oldInflection => {
    return {
      ...oldInflection,

      /*
       * This solves the issue with `blah-table1s` becoming `blahTable1S`
       * (i.e. the capital S at the end) or `table1-connection becoming `Table1SConnection`
       */
      camelCase: fixCapitalisedPlural(oldInflection.camelCase),
      upperCamelCase: fixCapitalisedPlural(oldInflection.upperCamelCase),

      /*
       * Pluralize/singularize only supports single words, so only run
       * on the final segment of a name.
       */
      pluralize: fixChangePlural(oldInflection.pluralize),
      singularize: fixChangePlural(oldInflection.singularize),

      distinctPluralize(str) {
        const singular = this.singularize(str);
        const plural = this.pluralize(singular);
        if (singular !== plural) {
          return plural;
        }
        if (
          plural.endsWith("ch") ||
          plural.endsWith("s") ||
          plural.endsWith("sh") ||
          plural.endsWith("x") ||
          plural.endsWith("z")
        ) {
          return plural + "es";
        } else if (plural.endsWith("y")) {
          return plural.slice(0, -1) + "ies";
        } else {
          return plural + "s";
        }
      },

      // Fix a naming bug
      deletedNodeId(table) {
        return this.camelCase(
          `deleted-${this.singularize(table.name)}-${nodeIdFieldName}`
        );
      },

      getBaseName(columnName) {
        const matches = columnName.match(
          /^(.+?)(_row_id|_id|_uuid|_fk|_pk|RowId|Id|Uuid|UUID|Fk|Pk)$/
        );
        if (matches) {
          return matches[1];
        }
        return null;
      },

      baseNameMatches(baseName, otherName) {
        const singularizedName = this.singularize(otherName);
        return baseName === singularizedName;
      },

      /* This is a good method to override. */
      getOppositeBaseName(baseName) {
        return (
          {
            /*
             * Changes to this list are breaking changes and will require a
             * major version update, so we need to group as many together as
             * possible! Rather than sending a PR, please look for an open
             * issue called something like "Add more opposites" (if there isn't
             * one then please open it) and add your suggestions to the GitHub
             * comments.
             */
            parent: "child",
            child: "parent",
            author: "authored",
            editor: "edited",
            reviewer: "reviewed",
          }[baseName] || null
        );
      },

      getBaseNameFromKeys(detailedKeys) {
        if (detailedKeys.length === 1) {
          const key = detailedKeys[0];
          const columnName = this._columnName(key);
          return this.getBaseName(columnName);
        }
        return null;
      },

      patchField() {
        return "patch";
      },

      allRows(table) {
        return this.camelCase(
          this.distinctPluralize(this._singularizedTableName(table))
        );
      },
      allRowsSimple(table) {
        return this.camelCase(
          this.distinctPluralize(this._singularizedTableName(table))
        );
      },

      computedColumn(pseudoColumnName, proc, _table) {
        return proc.tags.fieldName
          ? proc.tags.fieldName
          : this.camelCase(pseudoColumnName);
      },

      computedColumnList(pseudoColumnName, proc, _table) {
        return proc.tags.fieldName
          ? proc.tags.fieldName
          : this.camelCase(pseudoColumnName);
      },

      singleRelationByKeys(detailedKeys, table, _foreignTable, constraint) {
        if (constraint.tags.fieldName) {
          return constraint.tags.fieldName;
        }
        const baseName = this.getBaseNameFromKeys(detailedKeys);
        if (baseName) {
          return this.camelCase(baseName);
        }
        if (this.baseNameMatches(baseName, table.name)) {
          return this.camelCase(`${this._singularizedTableName(table)}`);
        }
        return oldInflection.singleRelationByKeys(
          detailedKeys,
          table,
          _foreignTable,
          constraint
        );
      },

      singleRelationByKeysBackwards(
        detailedKeys,
        table,
        _foreignTable,
        constraint
      ) {
        if (constraint.tags.foreignSingleFieldName) {
          return constraint.tags.foreignSingleFieldName;
        }
        if (constraint.tags.foreignFieldName) {
          return constraint.tags.foreignFieldName;
        }
        const baseName = this.getBaseNameFromKeys(detailedKeys);
        const oppositeBaseName = baseName && this.getOppositeBaseName(baseName);
        if (oppositeBaseName) {
          return this.camelCase(
            `${oppositeBaseName}-${this._singularizedTableName(table)}`
          );
        }
        if (this.baseNameMatches(baseName, table.name)) {
          return this.camelCase(`${this._singularizedTableName(table)}`);
        }
        return oldInflection.singleRelationByKeysBackwards(
          detailedKeys,
          table,
          _foreignTable,
          constraint
        );
      },

      _manyRelationByKeysBase(detailedKeys, table, _foreignTable, _constraint) {
        const baseName = this.getBaseNameFromKeys(detailedKeys);
        const oppositeBaseName = baseName && this.getOppositeBaseName(baseName);
        if (oppositeBaseName) {
          return this.camelCase(
            `${oppositeBaseName}-${this.distinctPluralize(
              this._singularizedTableName(table)
            )}`
          );
        }
        if (this.baseNameMatches(baseName, _foreignTable.name)) {
          return this.camelCase(
            `${this.distinctPluralize(this._singularizedTableName(table))}`
          );
        }
        return null;
      },

      manyRelationByKeys(detailedKeys, table, foreignTable, constraint) {
        if (constraint.tags.foreignFieldName) {
          if (constraint.tags.foreignSimpleFieldName) {
            return constraint.tags.foreignFieldName;
          } else {
            return constraint.tags.foreignFieldName;
          }
        }
        const base = this._manyRelationByKeysBase(
          detailedKeys,
          table,
          foreignTable,
          constraint
        );
        if (base) {
          return base;
        }
        return oldInflection.manyRelationByKeys(
          detailedKeys,
          table,
          foreignTable,
          constraint
        );
      },

      manyRelationByKeysSimple(detailedKeys, table, foreignTable, constraint) {
        if (constraint.tags.foreignSimpleFieldName) {
          return constraint.tags.foreignSimpleFieldName;
        }
        if (constraint.tags.foreignFieldName) {
          return constraint.tags.foreignFieldName;
        }
        const base = this._manyRelationByKeysBase(
          detailedKeys,
          table,
          foreignTable,
          constraint
        );
        if (base) {
          return base;
        }
        return oldInflection.manyRelationByKeys(
          detailedKeys,
          table,
          foreignTable,
          constraint
        );
      },

      functionQueryName(proc) {
        return this.camelCase(this._functionName(proc));
      },
      functionQueryNameList(proc) {
        return this.camelCase(this._functionName(proc));
      },

      tableNode(table) {
        return this.camelCase(
          `${this._singularizedTableName(table)}-by-${nodeIdFieldName}`
        );
      },
      rowByUniqueKeys(detailedKeys, table, constraint) {
        if (constraint.tags.fieldName) {
          return constraint.tags.fieldName;
        }
        if (constraint.type === "p") {
          // Primary key, shorten!
          return this.camelCase(this._singularizedTableName(table));
        } else {
          return this.camelCase(
            `${this._singularizedTableName(table)}-by-${detailedKeys
              .map(key => this.column(key))
              .join("-and-")}`
          );
        }
      },

      createField(table) {
        return this.camelCase(`${this._singularizedTableName(table)}-create`);
      },

      createInputType(table) {
        return this.upperCamelCase(
          `${this._singularizedTableName(table)}-create-input`
        );
      },

      createPayloadType(table) {
        return this.upperCamelCase(
          `${this._singularizedTableName(table)}-create-payload`
        );
      },

      updateByKeys(detailedKeys, table, constraint) {
        if (constraint.tags.updateFieldName) {
          return constraint.tags.updateFieldName;
        }
        if (constraint.type === "p") {
          return this.camelCase(`${this._singularizedTableName(table)}-update`);
        } else {
          return this.camelCase(
            `${this._singularizedTableName(table)}-update-by-${detailedKeys
              .map(key => this.column(key))
              .join("-and-")}`
          );
        }
      },

      deleteByKeys(detailedKeys, table, constraint) {
        if (constraint.tags.deleteFieldName) {
          return constraint.tags.deleteFieldName;
        }
        if (constraint.type === "p") {
          // Primary key, shorten!
          return this.camelCase(`${this._singularizedTableName(table)}-delete`);
        } else {
          return this.camelCase(
            `${this._singularizedTableName(table)}-delete-by-${detailedKeys
              .map(key => this.column(key))
              .join("-and-")}`
          );
        }
      },

      updateByKeysInputType(detailedKeys, table, constraint) {
        if (constraint.tags.updateFieldName) {
          return this.upperCamelCase(
            `${constraint.tags.updateFieldName}-input`
          );
        }

        if (constraint.type === "p") {
          // Primary key, shorten!
          return this.upperCamelCase(
            `${this._singularizedTableName(table)}-update-input`
          );
        } else {
          return this.upperCamelCase(
            `${this._singularizedTableName(table)}-update-by-${detailedKeys
              .map(key => this.column(key))
              .join("-and-")}-input`
          );
        }
      },

      deleteByKeysInputType(detailedKeys, table, constraint) {
        if (constraint.tags.deleteFieldName) {
          return this.upperCamelCase(
            `${constraint.tags.deleteFieldName}-input`
          );
        }
        if (constraint.type === "p") {
          // Primary key, shorten!
          return this.upperCamelCase(
            `${this._singularizedTableName(table)}-delete-input`
          );
        } else {
          return this.upperCamelCase(
            `${this._singularizedTableName(table)}-delete-by-${detailedKeys
              .map(key => this.column(key))
              .join("-and-")}-input`
          );
        }
      },

      updateNode(table) {
        return this.camelCase(
          `${this._singularizedTableName(table)}-update-by-${nodeIdFieldName}`
        );
      },

      deleteNode(table) {
        return this.camelCase(
          `${this._singularizedTableName(table)}-delete-by-${nodeIdFieldName}`
        );
      },

      updateNodeInputType(table) {
        return this.upperCamelCase(
          `${this._singularizedTableName(
            table
          )}-update-by-${nodeIdFieldName}-input`
        );
      },

      deleteNodeInputType(table) {
        return this.upperCamelCase(
          `${this._singularizedTableName(
            table
          )}-delete-by-${nodeIdFieldName}-input`
        );
      },
    };
  });
}

module.exports = PgShopifyInflectorPlugin;
// Hacks for TypeScript/Babel import
module.exports.default = PgShopifyInflectorPlugin;
Object.defineProperty(module.exports, "__esModule", { value: true });
