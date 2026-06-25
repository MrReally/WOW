# Safe data entry checklist

Use this on a small test dataset before importing the real warehouse.

## Warehouse CSV

- Import 5-10 rows from `docs/warehouse-csv-template.csv`.
- Include both `serial` equipment and `quantity` equipment.
- Verify grouping by type.
- Verify search by model, name, asset tag, and serial.
- Open several unit cards.
- Check cable quantities and remaining stock.

## Project lifecycle

- Create one test project.
- Add reservations.
- Allocate own equipment.
- Add contractor equipment with cost and client price.
- Issue equipment.
- Return equipment partially and fully.
- Verify Apex problems.
- Verify Contractors returns.
- Verify Finance totals, client debt, contractor debt, cost, and margin.
