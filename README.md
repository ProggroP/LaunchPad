# LaunchPad

*Upcoming rocket launches on your wrist.*

A Pebble watchapp (v1.1.1) built with Alloy (Moddable JavaScript). It lists
the next ten rocket launches from [The Space Devs Launch Library 2](https://thespacedevs.com/llapi),
with a colour-coded status per launch:

| Status | Colour |
|---|---|
| Go | green |
| TBC | orange |
| TBD | grey |
| Hold, failure and others | red |

Scroll with the buttons or by touch.

## Platforms

- Pebble Time 2 (`emery`)
- Pebble Round 2 (`gabbro`)

## Building

With the [Pebble SDK](https://developer.repebble.com/sdk/) (4.17; under 4.33.1
the Alloy runtime currently aborts with `xsGetHostDestructor: not a host object`):

```bash
pebble build
pebble install --emulator emery
```

The repository can also be imported into CloudPebble as is.

## License

MIT License, see [LICENSE](LICENSE).
