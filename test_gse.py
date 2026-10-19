import unittest
import GSE

class GSEComponentTests(unittest.TestCase):
    def compile(self, source):
        return GSE.compile_gse(source)

    def test_led_blink(self):
        result = self.compile('void setup(){pinMode(13,OUTPUT);} void loop(){digitalWrite(13,HIGH);analogWrite(9,128);delay(500);}')
        ops = [x['op'] for x in result['program']['setup'] + result['program']['loop']]
        self.assertIn('PIN_MODE', ops)
        self.assertIn('DIGITAL_WRITE', ops)
        self.assertIn('ANALOG_WRITE', ops)

    def test_button_input(self):
        result = self.compile('const int buttonPin=2; void setup(){pinMode(buttonPin,INPUT_PULLUP);} void loop(){if(digitalRead(buttonPin)==LOW){digitalWrite(13,HIGH);}else{digitalWrite(13,LOW);}}')
        self.assertTrue(any(x['op'] == 'IF' for x in result['program']['loop']))

    def test_ssd1306_oled(self):
        source = '''#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define SCREEN_ADDRESS 0x3C
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
void setup(){display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS);display.clearDisplay();display.setTextSize(1);display.setTextColor(SSD1306_WHITE);display.setCursor(0,0);display.println(F("Hello OLED"));display.drawRect(0,0,128,64,SSD1306_WHITE);display.display();}
void loop(){}'''
        result = self.compile(source)
        ops = [x['op'] for x in result['program']['setup']]
        for expected in ('OLED_BEGIN', 'OLED_CLEAR', 'OLED_TEXT_SIZE', 'OLED_TEXT_COLOR', 'OLED_CURSOR', 'OLED_PRINTLN', 'OLED_RECT', 'OLED_DISPLAY'):
            self.assertIn(expected, ops)

    def test_custom_named_oled_object(self):
        result = self.compile('Adafruit_SSD1306 oled(128,64,&Wire,-1); void setup(){oled.begin(2,0x3C);oled.clearDisplay();oled.setCursor(0,0);oled.println("hi");oled.fillRect(1,2,10,10,SSD1306_WHITE);oled.display();} void loop(){}')
        ops = [x['op'] for x in result['program']['setup']]
        self.assertIn('OLED_BEGIN', ops)
        self.assertIn('OLED_FILL_RECT', ops)
        self.assertIn('OLED_DISPLAY', ops)

    def test_servo(self):
        result = self.compile('#include <Servo.h>\nServo myServo; void setup(){myServo.attach(9);} void loop(){myServo.write(90);Serial.println(myServo.read());}')
        ops = [x['op'] for x in result['program']['setup'] + result['program']['loop']]
        self.assertIn('SERVO_ATTACH', ops)
        self.assertIn('SERVO_WRITE', ops)
        self.assertIn('SERIAL_PRINTLN', ops)

if __name__ == '__main__':
    unittest.main()
