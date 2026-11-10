# PCF8574T LCD Backpack Pinout & All-Pin Wire-Touch Guide

## 1. Physical Layout of the LCD Backpack

```text
                           BACKPACK TOP VIEW
          +--------------------------------------------------+
          | [A0] [A1] [A2]     PCF8574T                      |
          |  (Unsoldered)        CHIP                        |
          |                                   [Blue Trimpot] |
[GND] --->| (o) GND                                          |
[VCC] --->| (o) VCC                                   [LED]  |
[SDA] --->| (o) SDA (GPIO 0)                         [Jumper]|
[SCL] --->| (o) SCL (GPIO 1)                                 |
          +--------------------------------------------------+
             |   |   |   |   |   |   |   |   |   |   |   |   |   |   |   |
            [1] [2] [3] [4] [5] [6] [7] [8] [9] [10][11][12][13][14][15][16]
             ^           ^       ^                   ^   ^   ^   ^       ^
            GND         P0      P2                  P4  P5  P6  P7     LED-
```

---

## 2. All Pins Status & Touch Test Targets

| Header Pin # | PCF8574 Port | Original LCD Role | Test Status | What Happens When Touched to Pin 1 (GND) |
| :---: | :---: | :---: | :---: | :--- |
| **1** | **GND** | Ground | **GROUND** | **Use this as your Probe Wire!** |
| **2** | VDD | 5V / 3.3V | Power | ⚠️ Do NOT touch to GND (causes power short) |
| **3** | V0 | Contrast | Analog | Safe to touch, but not a digital port |
| **4** | **P0** | RS (Register Select) | **TESTABLE** | Triggers `Bit 0 (Pin 4 | P0) TOUCHED!` |
| **5** | **P1** | R/W (Read/Write) | PCB Ground | Already grounded by PCB trace |
| **6** | **P2** | E (Enable) | **TESTABLE** | Triggers `Bit 2 (Pin 6 | P2) TOUCHED!` |
| **7–10**| NC | D0–D3 | Disconnected | No trace on board (reads floating/high) |
| **11**| **P4** | D4 | **PRIMARY** | Triggers `Bit 4 (Pin 11 | P4 / Enc 1 SW) TOUCHED!` |
| **12**| **P5** | D5 | **PRIMARY** | Triggers `Bit 5 (Pin 12 | P5 / Enc 2 SW) TOUCHED!` |
| **13**| **P6** | D6 | **PRIMARY** | Triggers `Bit 6 (Pin 13 | P6 / Enc 3 SW) TOUCHED!` |
| **14**| **P7** | D7 | **TESTABLE** | Triggers `Bit 7 (Pin 14 | P7) TOUCHED!` |
| **15**| Anode | Backlight + | LED Power | Backlight anode |
| **16**| **P3** | Backlight - | Transistor | Connected to Q1 transistor |

---

## 3. How to Perform the Wire-Touch Test

1. **Power & I2C connections (4-pin header):**
   * Backpack `GND` $\rightarrow$ ESP32 `GND`
   * Backpack `VCC` $\rightarrow$ ESP32 `3.3V`
   * Backpack `SDA` $\rightarrow$ ESP32 `GPIO 0`
   * Backpack `SCL` $\rightarrow$ ESP32 `GPIO 1`
2. **Take ONE jumper wire:**
   * Plug one end firmly into **Pin 1 (GND)** of the 16-pin row.
   * Hold the bare metallic tip of the other end.
3. **Touch the test pins:**
   * Touch **Pin 11** $\rightarrow$ Terminal logs `Bit 4 (P4 / Enc 1 SW) TOUCH STARTED`
   * Touch **Pin 12** $\rightarrow$ Terminal logs `Bit 5 (P5 / Enc 2 SW) TOUCH STARTED`
   * Touch **Pin 13** $\rightarrow$ Terminal logs `Bit 6 (P6 / Enc 3 SW) TOUCH STARTED`
   * Touch **Pin 14** $\rightarrow$ Terminal logs `Bit 7 (P7) TOUCH STARTED`
   * Touch **Pin 4**  $\rightarrow$ Terminal logs `Bit 0 (P0) TOUCH STARTED`
   * Touch **Pin 6**  $\rightarrow$ Terminal logs `Bit 2 (P2) TOUCH STARTED`
4. When you pull the wire away, the terminal instantly logs `[TOUCH RELEASED]`.
