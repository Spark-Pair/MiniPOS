# MiniPOS

Simple offline-first Windows desktop POS by SparkPair.

## MVP

- Point of Sale / cart
- Products and stock
- SKU search
- Customers
- Cash, Card, Bank and Other payments
- Discounts and tax
- Sales history
- Expenses
- Dashboard and reports
- Local SQLite database
- Windows installer and portable EXE

## Development

```bash
npm install
npm start
```

## Windows build

```bash
npm run dist
```

GitHub Actions builds the Windows installer and portable EXE when a `v*` tag is pushed.

## Download

Open the GitHub **Releases** section and download the latest Windows `.exe`.
