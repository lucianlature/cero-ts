# Logging

cero-ts automatically logs every task execution with structured data, making debugging and monitoring effortless. Choose from multiple formatters to match your logging infrastructure.

## Formatters

Choose the format that works best for your logging system:

| Formatter | Use Case | Output Style |
|-----------|----------|--------------|
| `LineFormatter` | Traditional logging | Single-line format |
| `JsonFormatter` | Structured systems | Compact JSON |
| `KeyValueFormatter` | Log parsing | `key=value` pairs |
| `LogstashFormatter` | ELK stack | JSON with @version/@timestamp |
| `RawFormatter` | Minimal output | Message content only |

### Sample Output

**Success (INFO level):**
```
I, [2026-01-22T10:30:00.000Z #1234] INFO -- cero: index=0 chain_id="018c2b95-b764-7615-a924-cc5b910ed1e5" type="Task" class="GenerateInvoice" state="complete" status="success" metadata={runtime: 187}
```

**Skipped (INFO level):**
```
I, [2026-01-22T10:30:01.000Z #1234] INFO -- cero: index=1 chain_id="018c2b95-23j4-2kj3-32kj-3n4jk3n4jknf" type="Task" class="ValidateCustomer" state="interrupted" status="skipped" reason="Customer already validated"
```

**Failed (ERROR level):**
```
E, [2026-01-22T10:30:02.000Z #1234] ERROR -- cero: index=2 chain_id="018c2b95-2a02-7dbc-b713-b20a7379704f" type="Task" class="CalculateTax" state="interrupted" status="failed" reason="Tax service unavailable" metadata={errorCode: "TAX_SERVICE_DOWN"}
```

## Log Structure

Every log entry includes rich metadata:

### Core Fields

| Field | Description | Example |
|-------|-------------|---------|
| `level` | Log level | `INFO`, `WARN`, `ERROR` |
| `timestamp` | ISO 8601 execution time | `2026-01-22T10:30:00.000Z` |
| `pid` | Process ID | `1234` |
| `progname` | Program name | `cero` |

### Task Information

| Field | Description | Example |
|-------|-------------|---------|
| `index` | Execution sequence position | `0`, `1`, `2` |
| `chainId` | Unique execution chain ID | `018c2b95-b764-7615...` |
| `type` | Execution unit type | `Task`, `Workflow` |
| `class` | Task class name | `GenerateInvoice` |
| `id` | Unique task instance ID | `018c2b95-b764-7615...` |
| `tags` | Custom categorization | `["billing", "financial"]` |

### Execution Data

| Field | Description | Example |
|-------|-------------|---------|
| `state` | Lifecycle state | `complete`, `interrupted` |
| `status` | Business outcome | `success`, `skipped`, `failed` |
| `metadata` | Custom task data | `{ orderId: 123, amount: 99.99 }` |

### Failure Information

| Field | Description |
|-------|-------------|
| `reason` | Human-readable failure message |
| `cause` | Error that caused the failure |
| `causedFailure` | Original failing task details |
| `threwFailure` | Task that propagated the failure |

## Using the Logger

### Import and Create

```typescript
import { Logger } from 'cero-ts/logging';

const logger = new Logger();
```

### Log Results

```typescript
import { Task, Logger } from 'cero-ts';
import { Logger } from 'cero-ts/logging';

const logger = new Logger();

const result = await MyTask.execute({ data: 'value' });
logger.log(result);
```

### Custom Options

```typescript
import { Logger, JsonFormatter, LogstashFormatter } from 'cero-ts/logging';

// JSON output
const jsonLogger = new Logger({
  formatter: new JsonFormatter(),
  level: 'debug',
});

// Logstash format for ELK
const elkLogger = new Logger({
  formatter: new LogstashFormatter(),
  progname: 'my-service',
});

// Custom output stream
const fileLogger = new Logger({
  output: fs.createWriteStream('/var/log/tasks.log'),
});

// Disable logging
const silentLogger = new Logger({
  enabled: false,
});
```

## Log Levels

| Level | Use Case |
|-------|----------|
| `debug` | Detailed debugging information |
| `info` | Normal operation (success, skip) |
| `warn` | Warning conditions |
| `error` | Error conditions (failures) |

The logger automatically selects the appropriate level:
- `success` → `info`
- `skipped` → `info`
- `failed` → `error`

Override the level per log:

```typescript
logger.log(result, { level: 'warn' });
```

## Formatters

### LineFormatter (Default)

Traditional single-line log format:

```typescript
import { Logger, LineFormatter } from 'cero-ts/logging';

const logger = new Logger({
  formatter: new LineFormatter(),
});

// Output:
// I, [2026-01-22T10:30:00.000Z #1234] INFO -- cero: index=0 chain_id="..." type="Task" class="MyTask" state="complete" status="success"
```

### JsonFormatter

Compact JSON for structured logging systems:

```typescript
import { Logger, JsonFormatter } from 'cero-ts/logging';

const logger = new Logger({
  formatter: new JsonFormatter(),
});

// Output:
// {"level":"info","timestamp":"2026-01-22T10:30:00.000Z","pid":1234,"progname":"cero","result":{...}}
```

### KeyValueFormatter

Key-value pairs for easy parsing:

```typescript
import { Logger, KeyValueFormatter } from 'cero-ts/logging';

const logger = new Logger({
  formatter: new KeyValueFormatter(),
});

// Output:
// level=info timestamp=2026-01-22T10:30:00.000Z pid=1234 progname=cero index=0 chain_id=... type=Task class=MyTask state=complete status=success
```

### LogstashFormatter

JSON with ELK-compatible fields:

```typescript
import { Logger, LogstashFormatter } from 'cero-ts/logging';

const logger = new Logger({
  formatter: new LogstashFormatter(),
});

// Output:
// {"@version":"1","@timestamp":"2026-01-22T10:30:00.000Z","level":"info","pid":1234,"progname":"cero","result":{...}}
```

### RawFormatter

Minimal output with just the message:

```typescript
import { Logger, RawFormatter } from 'cero-ts/logging';

const logger = new Logger({
  formatter: new RawFormatter(),
});

// Output:
// index=0 type=Task class=MyTask state=complete status=success
```

## Custom Formatters

Create your own formatter by implementing the `LogFormatter` interface:

```typescript
import { LogFormatter, LogEntry } from 'cero-ts/logging';

class MyCustomFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    return JSON.stringify({
      time: entry.timestamp.toISOString(),
      task: entry.result.class,
      ok: entry.result.status === 'success',
      data: entry.result.metadata,
    });
  }
}

const logger = new Logger({
  formatter: new MyCustomFormatter(),
});
```

## Automatic Logging

Configure global logging for all tasks:

```typescript
import { configure } from 'cero-ts';
import { Logger, JsonFormatter } from 'cero-ts/logging';

const logger = new Logger({
  formatter: new JsonFormatter(),
  level: 'info',
});

configure((config) => {
  config.callbacks.register('onExecuted', (task) => {
    if (task.result) {
      logger.log(task.result);
    }
  });
});
```

## Tags

Add custom tags for categorization:

```typescript
logger.log(result, {
  tags: ['billing', 'critical', 'retry-3'],
});
```

## Dry Run Mode

Mark logs as dry-run for testing:

```typescript
logger.log(result, {
  dryRun: true,
});

// Output includes: dry_run=true
```
