
const resolvers = {
  Query: {
    budgetSummary(obj, args, context) {
      const logger = context.logger;
      const pool = context.pool;
      const which = args.breakdown;
      let categoryColumn = 'department_name';
      let view = 'coagis.v_budget_summary_by_dept';
      if (which === 'use') {
        categoryColumn = 'category_name';
        view = 'coagis.v_budget_summary_by_use';
      }
      let maxCategories = 10;
      if ('maxCategories' in args) maxCategories = args.maxCategories + 0;
      const query = `
        SELECT account_type, category_name, year, SUM(total_budget) as total_budget,
          SUM(total_actual) AS total_actual
        FROM (
          select 
            account_type, year, total_budget, total_actual, row,
            case 
              when row > ${maxCategories} or ${categoryColumn} = 'Non-Departmental Department'
              then 'Other'
              else ${categoryColumn}
            end AS category_name
          from ${view}
          where year >= 2015
        ) as ii
        GROUP BY account_type, category_name, year
        ORDER BY year desc, account_type, total_budget desc
      `;
      return pool.query(query)
      .then((result) => {
        if (result.rows.length === 0) return null;
        const p = result.rows;
        return p;
      })
      .catch((err) => {
        if (err) {
          logger.error(`Got an error in property: ${err}`);
        }
      });
    },
    budgetHistory(obj, args, context) {
      const logger = context.logger;
      const pool = context.pool;
      return pool.query(
        'SELECT * from coagis.v_budget_proposed_plus_history where year >= 2015'
      )
      .then((result) => {
        if (result.rows.length === 0) return null;
        const p = result.rows;
        return p;
      })
      .catch((err) => {
        if (err) {
          logger.error(`Got an error in property: ${err}`);
        }
      });
    },
    budgetCashFlow(obj, args, context) {
      const logger = context.logger;
      const pool = context.pool;
      let query = `
        SELECT account_type, department_name, dept_id, fund_id, fund_name,
          SUM(budget) as budget, NULL as category_name, NULL as category_id, year
        FROM coagis.v_budget_proposed_plus_history
        WHERE account_type = 'E' and year = 2018 and budget <> 0
        GROUP BY account_type, year, fund_id, fund_name, dept_id,
        department_name, category_id, category_name
      `;
      if (args.accountType === 'R') {
        query = `
        SELECT account_type, category_name, category_id, year, SUM(budget) as budget,
          fund_name, fund_id, NULL as dept_id, NULL as department_name
        FROM coagis.v_budget_proposed_plus_history
        WHERE account_Type = 'R' and year = 2018 and budget <> 0
        GROUP BY category_id, category_name, account_type, year, fund_id,
        fund_name, dept_id, department_name
      `;
      }
      return pool.query(query)
      .then((result) => {
        if (result.rows.length === 0) return null;
        const p = result.rows;
        return p;
      })
      .catch((err) => {
        if (err) {
          logger.error(`Got an error in property: ${err}`);
        }
      });
    },
  },
};

module.exports = resolvers;
