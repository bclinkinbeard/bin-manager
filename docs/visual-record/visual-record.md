# BinManager Visual Record

Generated with `uvx rodney` automation after importing fixture data from `./fixtures/test-fixture-data.json`.

## Sitemap

- [Search View](#search-view) (`#search?q=electronics&archived=1`)
  - [Bin Detail View](#bin-detail-view) (`#bin/:binId`)
    - [Tag Results View](#tag-results-view) (`#tag/:tag`)
    - [Bin Form (Edit) View](#bin-form-edit-view) (`#bin-form/:binId?edit=1`)
    - [Item Form (Add) View](#item-form-add-view) (`#item-form?bin=:binId`)
    - [Item Form (Edit) View](#item-form-edit-view) (`#item-form/edit/:itemId`)
    - [Multi-Crop Route Behavior](#multi-crop-route-behavior) (`#multi-crop?bin=:binId`)
  - [Scan View](#scan-view) (`#scan`)
  - [Bins View](#bins-view) (`#bins`)
    - [Bin Form (New) View](#bin-form-new-view) (`#bin-form/:binId`)
  - [Data View](#data-view) (`#data`)

## Search View

- Route: `#search?q=electronics&archived=1`
- Fixture: `./fixtures/test-fixture-data.json`

![Search view screenshot](./screens/01-search.png)

## Scan View

- Route: `#scan`
- Fixture: `./fixtures/test-fixture-data.json`
- Note: Camera access in headless Rodney caused browser crashes. For this capture only, `Html5Qrcode` was runtime-mocked so the scan UI could be recorded.

![Scan view screenshot](./screens/02-scan.png)

## Bins View

- Route: `#bins`
- Fixture: `./fixtures/test-fixture-data.json`

![Bins view screenshot](./screens/03-bins.png)

## Data View

- Route: `#data`
- Fixture: `./fixtures/test-fixture-data.json`

![Data view screenshot](./screens/04-data.png)

## Bin Detail View

- Route: `#bin/BIN-001`
- Fixture: `./fixtures/test-fixture-data.json`

![Bin detail view screenshot](./screens/05-bin-BIN-001.png)

## Tag Results View

- Route: `#tag/electronics?origin=BIN-001`
- Fixture: `./fixtures/test-fixture-data.json`

![Tag results view screenshot](./screens/06-tag-electronics.png)

## Bin Form (Edit) View

- Route: `#bin-form/BIN-001?edit=1`
- Fixture: `./fixtures/test-fixture-data.json`

![Bin form edit screenshot](./screens/07-bin-form-edit-BIN-001.png)

## Bin Form (New) View

- Route: `#bin-form/BIN-010`
- Fixture: `./fixtures/test-fixture-data.json`

![Bin form new screenshot](./screens/08-bin-form-new-BIN-010.png)

## Item Form (Add) View

- Route: `#item-form?bin=BIN-001`
- Fixture: `./fixtures/test-fixture-data.json`

![Item form add screenshot](./screens/09-item-form-add-BIN-001.png)

## Item Form (Edit) View

- Route: `#item-form/edit/item-001`
- Fixture: `./fixtures/test-fixture-data.json`

![Item form edit screenshot](./screens/10-item-form-edit-item-001.png)

## Multi-Crop Route Behavior

- Route tested: `#multi-crop?bin=BIN-001`
- Fixture: `./fixtures/test-fixture-data.json`
- Current behavior: this route resolves to `view-bin` in `applyRouteFromHash`, not `view-multi-crop`.

![Multi-crop route behavior screenshot](./screens/11-multi-crop-route.png)
