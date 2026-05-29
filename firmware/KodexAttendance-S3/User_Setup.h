// ─────────────────────────────────────────────────────────────────────────────
//  TFT_eSPI User Setup — ESP32-S3 + ILI9341V 2.8" IPS
//  Board: Shenzhen Hong Shu Yuan Technology Co., Ltd.
//  SKU:   ES3C28P (with capacitive touch) / ES3N28P (no touch)
//
//  Confirmed pin mapping (from official datasheet + hardware verified):
//    BL   = IO45   backlight, HIGH = on
//    CS   = IO10   display chip select, LOW = active
//    DC   = IO46   data/command select
//    SCLK = IO12   SPI clock
//    MOSI = IO11   SPI data out
//    MISO = IO13   SPI data in
//    RST  = EN     tied to ESP32-S3 reset — no GPIO needed (software reset only)
//
//  Touch (FT6336G capacitive):
//    SDA  = IO16   I2C data
//    SCL  = IO15   I2C clock
//    RST  = IO18
//    INT  = IO17
//
//  SD card (SDIO, not SPI):
//    CLK  = IO38   CMD = IO40   DATA0-3 = IO39/41/48/47
// ─────────────────────────────────────────────────────────────────────────────

#define USER_SETUP_LOADED
#define ILI9341_DRIVER

#define TFT_MISO  13
#define TFT_MOSI  11
#define TFT_SCLK  12
#define TFT_CS    10
#define TFT_DC    46
#define TFT_RST   -1   // RST tied to EN — software reset only
#define TFT_BL    45

#define SPI_FREQUENCY       40000000
#define SPI_READ_FREQUENCY  20000000

#define LOAD_GLCD
#define LOAD_FONT2
#define LOAD_FONT4
#define LOAD_FONT6
#define LOAD_FONT7
#define LOAD_FONT8
#define LOAD_GFXFF
#define SMOOTH_FONT
