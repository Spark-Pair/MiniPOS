const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

function createDatabase(dir) {
  const file = path.join(dir, 'minipos.sqlite');
  let db;

  const ready = initSqlJs({
    locateFile: (f) => path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', f)
  }).then((SQL) => {
    db = fs.existsSync(file)
      ? new SQL.Database(fs.readFileSync(file))
      : new SQL.Database();

    db.run('PRAGMA foreign_keys=ON');

    db.run(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sku TEXT NOT NULL UNIQUE,
        category TEXT DEFAULT '',
        price REAL DEFAULT 0,
        cost REAL DEFAULT 0,
        stock REAL DEFAULT 0,
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_no TEXT UNIQUE,
        customer_id INTEGER,
        subtotal REAL,
        discount REAL,
        tax REAL,
        total REAL,
        paid REAL,
        change_amount REAL,
        payment_method TEXT DEFAULT 'Cash',
        status TEXT DEFAULT 'completed',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sale_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER,
        product_id INTEGER,
        product_name TEXT,
        qty REAL,
        price REAL,
        total REAL
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        amount REAL,
        note TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS setting_options (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_key TEXT NOT NULL,
        label TEXT NOT NULL,
        value TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        active INTEGER DEFAULT 1,
        UNIQUE(group_key, value)
      );
    `);

    seedOptions();
    save();
  });

  function save() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(db.export()));
  }

  function rows(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const result = [];

    while (stmt.step()) {
      result.push(stmt.getAsObject());
    }

    stmt.free();
    return result;
  }

  function one(sql, params = []) {
    return rows(sql, params)[0] || null;
  }

  function seedOptions() {
    const defaults = {
      payment_methods: ['Cash', 'Card', 'Bank Transfer', 'Other'],
      categories: ['General', 'Grocery', 'Beverages', 'Food'],
      cities: ['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi'],
      units: ['Piece', 'Box', 'Kg', 'Gram', 'Liter'],
      expense_categories: ['Rent', 'Utilities', 'Salaries', 'Transport', 'Other']
    };

    for (const [groupKey, items] of Object.entries(defaults)) {
      const result = one(
        'SELECT COUNT(*) AS count FROM setting_options WHERE group_key = ?',
        [groupKey]
      );

      if (!result.count) {
        items.forEach((value, index) => {
          db.run(
            'INSERT OR IGNORE INTO setting_options(group_key, label, value, sort_order) VALUES(?, ?, ?, ?)',
            [groupKey, value, value, index]
          );
        });
      }
    }
  }

  return {
    ready: async () => {
      await ready;
      return { ok: true };
    },

    dashboard: async () => {
      await ready;

      return {
        ok: true,
        products: one('SELECT COUNT(*) AS count FROM products WHERE active = 1').count,
        lowStock: one('SELECT COUNT(*) AS count FROM products WHERE active = 1 AND stock <= 5').count,
        customers: one('SELECT COUNT(*) AS count FROM customers').count,
        todaySales: one(
          "SELECT COALESCE(SUM(total), 0) AS total FROM sales WHERE status = 'completed' AND date(created_at, 'localtime') = date('now', 'localtime')"
        ).total,
        todayTransactions: one(
          "SELECT COUNT(*) AS count FROM sales WHERE status = 'completed' AND date(created_at, 'localtime') = date('now', 'localtime')"
        ).count
      };
    },

    products: async ({ search = '' }) => {
      await ready;

      return {
        ok: true,
        items: rows(
          'SELECT * FROM products WHERE active = 1 AND (name LIKE ? OR sku LIKE ? OR category LIKE ?) ORDER BY name',
          [`%${search}%`, `%${search}%`, `%${search}%`]
        )
      };
    },

    saveProduct: async (product) => {
      await ready;

      if (!product.name || !product.sku) {
        return { ok: false, error: 'Name and SKU are required' };
      }

      try {
        const params = [
          product.name,
          product.sku,
          product.category || '',
          Number(product.price) || 0,
          Number(product.cost) || 0,
          Number(product.stock) || 0
        ];

        if (product.id) {
          db.run(
            'UPDATE products SET name = ?, sku = ?, category = ?, price = ?, cost = ?, stock = ? WHERE id = ?',
            [...params, product.id]
          );
        } else {
          db.run(
            'INSERT INTO products(name, sku, category, price, cost, stock) VALUES(?, ?, ?, ?, ?, ?)',
            params
          );
        }

        save();
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    },

    customers: async ({ search = '' }) => {
      await ready;

      return {
        ok: true,
        items: rows(
          'SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? ORDER BY name',
          [`%${search}%`, `%${search}%`]
        )
      };
    },

    saveCustomer: async (customer) => {
      await ready;

      const params = [customer.name, customer.phone || ''];

      if (customer.id) {
        db.run('UPDATE customers SET name = ?, phone = ? WHERE id = ?', [...params, customer.id]);
      } else {
        db.run('INSERT INTO customers(name, phone) VALUES(?, ?)', params);
      }

      save();
      return { ok: true };
    },

    sales: async ({ search = '' }) => {
      await ready;

      return {
        ok: true,
        items: rows(
          "SELECT s.*, COALESCE(c.name, 'Walk-in Customer') AS customer_name FROM sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.invoice_no LIKE ? OR COALESCE(c.name, '') LIKE ? ORDER BY s.id DESC LIMIT 200",
          [`%${search}%`, `%${search}%`]
        )
      };
    },

    createSale: async (sale) => {
      await ready;

      if (!sale.items?.length) {
        return { ok: false, error: 'Cart is empty' };
      }

      const subtotal = sale.items.reduce(
        (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.price) || 0),
        0
      );

      const total = Math.max(
        0,
        subtotal - (Number(sale.discount) || 0) + (Number(sale.tax) || 0)
      );

      const paid = Number(sale.paid) || 0;

      if (paid < total) {
        return { ok: false, error: 'Paid amount is less than total' };
      }

      try {
        db.run('BEGIN');

        for (const item of sale.items) {
          const product = one(
            'SELECT * FROM products WHERE id = ? AND active = 1',
            [item.product_id]
          );

          if (!product) {
            throw new Error('Product not found');
          }

          if (product.stock < item.qty) {
            throw new Error(`Insufficient stock: ${product.name}`);
          }
        }

        const invoiceNo = `INV-${Date.now()}`;

        db.run(
          'INSERT INTO sales(invoice_no, customer_id, subtotal, discount, tax, total, paid, change_amount, payment_method) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            invoiceNo,
            sale.customer_id || null,
            subtotal,
            Number(sale.discount) || 0,
            Number(sale.tax) || 0,
            total,
            paid,
            paid - total,
            sale.payment_method || 'Cash'
          ]
        );

        const saleId = one('SELECT last_insert_rowid() AS id').id;

        for (const item of sale.items) {
          db.run(
            'INSERT INTO sale_items(sale_id, product_id, product_name, qty, price, total) VALUES(?, ?, ?, ?, ?, ?)',
            [saleId, item.product_id, item.name, item.qty, item.price, item.qty * item.price]
          );

          db.run(
            'UPDATE products SET stock = stock - ? WHERE id = ?',
            [item.qty, item.product_id]
          );
        }

        db.run('COMMIT');
        save();

        return {
          ok: true,
          saleId,
          invoice_no: invoiceNo,
          total,
          paid,
          change: paid - total,
          items: sale.items
        };
      } catch (error) {
        try {
          db.run('ROLLBACK');
        } catch (_) {}

        return { ok: false, error: error.message };
      }
    },

    expenses: async () => {
      await ready;
      return {
        ok: true,
        items: rows('SELECT * FROM expenses ORDER BY id DESC LIMIT 200')
      };
    },

    saveExpense: async (expense) => {
      await ready;

      db.run(
        'INSERT INTO expenses(title, amount, note) VALUES(?, ?, ?)',
        [expense.title, Number(expense.amount) || 0, expense.note || '']
      );

      save();
      return { ok: true };
    },

    report: async () => {
      await ready;

      return {
        ok: true,
        summary: one(
          "SELECT COUNT(*) AS transactions, COALESCE(SUM(total), 0) AS sales FROM sales WHERE status = 'completed' AND date(created_at, 'localtime') = date('now', 'localtime')"
        ),
        expenses: one(
          "SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE date(created_at, 'localtime') = date('now', 'localtime')"
        )
      };
    },

    settings: async () => {
      await ready;

      const savedRows = rows('SELECT key, value FROM settings');
      const values = {};

      savedRows.forEach((item) => {
        values[item.key] = item.value;
      });

      return {
        ok: true,
        values,
        groups: [
          {
            key: 'payment_methods',
            label: 'Payment Methods',
            description: 'Methods available at checkout'
          },
          {
            key: 'categories',
            label: 'Product Categories',
            description: 'Categories used for products'
          },
          {
            key: 'cities',
            label: 'Cities',
            description: 'Cities available in customer and business forms'
          },
          {
            key: 'units',
            label: 'Units',
            description: 'Units used when describing items'
          },
          {
            key: 'expense_categories',
            label: 'Expense Categories',
            description: 'Categories for shop expenses'
          }
        ],
        options: rows(
          'SELECT * FROM setting_options WHERE active = 1 ORDER BY group_key, sort_order, label'
        )
      };
    },

    saveSetting: async ({ key, value }) => {
      await ready;

      db.run(
        'INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [key, String(value ?? '')]
      );

      save();
      return { ok: true };
    },

    saveOption: async (option) => {
      await ready;

      if (!option.group_key || !option.label || !option.value) {
        return { ok: false, error: 'Name and value are required' };
      }

      try {
        if (option.id) {
          db.run(
            'UPDATE setting_options SET group_key = ?, label = ?, value = ?, sort_order = ?, active = 1 WHERE id = ?',
            [
              option.group_key,
              option.label,
              option.value,
              Number(option.sort_order) || 0,
              option.id
            ]
          );
        } else {
          db.run(
            'INSERT INTO setting_options(group_key, label, value, sort_order, active) VALUES(?, ?, ?, ?, 1)',
            [
              option.group_key,
              option.label,
              option.value,
              Number(option.sort_order) || 0
            ]
          );
        }

        save();
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    },

    deleteOption: async ({ id }) => {
      await ready;

      if (!id) {
        return { ok: false, error: 'Option id is required' };
      }

      db.run('DELETE FROM setting_options WHERE id = ?', [id]);
      save();

      return { ok: true };
    }
  };
}

module.exports = { createDatabase };
