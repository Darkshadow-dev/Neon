"""Small, safe Arduino-to-GSE translator for the browser simulator.
Supports the simulator's documented instruction schema and common Uno sketches.
It is not a replacement for the Arduino C++ compiler; use /compile for real builds.
"""
import re

TOKEN_RE = re.compile(r'''\s+|//[^\n]*|/\*[\s\S]*?\*/|(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(?:0[xX][\da-fA-F]+|0[bB][01]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)(?:[uU](?:[lL]{1,2})?|[lL]{1,2}[uU]?|[fF])?|(?:[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)|(?:<<=|>>=|>>>|\+\+|--|\+=|-=|\*=|/=|%=|&=|\|=|\^=|==|!=|<=|>=|&&|\|\||<<|>>|->)|[^\s]''')
TYPES = {'void','bool','boolean','byte','char','unsigned','signed','short','int','long','float','double','String','string','size_t','uint8_t','uint16_t','uint32_t','int8_t','int16_t','int32_t','const','static','volatile','PROGMEM','Servo','SoftwareSerial','Adafruit_SSD1306','Adafruit_SH1106G','Adafruit_SH110X','Adafruit_SH1107','SSD1306'}
SUPPORTED_HEADERS = {
    'Arduino.h': 'Arduino core basics',
    'Servo.h': 'Servo attach/write/detach/read',
    'SoftwareSerial.h': 'software serial TX in the Serial Monitor; RX reads as empty',
    'Wire.h': 'I2C initialization and SSD1306 transport',
    'SPI.h': 'SPI initialization',
    'EEPROM.h': 'EEPROM read/write/update/put/get',
    'Adafruit_GFX.h': 'GFX drawing primitives used by the OLED simulator',
    'Adafruit_SSD1306.h': 'SSD1306 OLED drawing and text',
    'Adafruit_SH110X.h': 'SH110X OLED drawing and text',
    'Adafruit_SH1106G.h': 'SH1106 OLED drawing and text',
    'Adafruit_SH1107.h': 'SH1107 OLED drawing and text',
    'math.h': 'common math functions',
}
CONSTANTS = {'HIGH':1,'LOW':0,'INPUT':'INPUT','OUTPUT':'OUTPUT','INPUT_PULLUP':'INPUT_PULLUP','LED_BUILTIN':13,'A0':'A0','A1':'A1','A2':'A2','A3':'A3','A4':'A4','A5':'A5','true':True,'false':False,'PI':3.141592653589793,'TWO_PI':6.283185307179586,'LSBFIRST':0,'MSBFIRST':1,'RISING':'RISING','FALLING':'FALLING','CHANGE':'CHANGE','SSD1306_WHITE':1,'SSD1306_BLACK':0,'SSD1306_INVERSE':2,'SSD1306_SWITCHCAPVCC':2,'SSD1306_EXTERNALVCC':1,'SSD1306_DISPLAYON':1,'SSD1306_DISPLAYOFF':0,'WHITE':1,'BLACK':0,'INVERSE':2}

class GSEError(ValueError): pass

class Parser:
    def __init__(self, source):
        self.defines = dict(CONSTANTS)
        self.includes = list(dict.fromkeys(re.findall(r'^\s*#\s*include\s*[<"]([^>"]+)[>"]', source, flags=re.M)))
        for macro, raw in re.findall(r'^\s*#\s*define\s+(\w+)\s+([^\n]+)', source, flags=re.M):
            raw = raw.strip()
            if re.fullmatch(r'-?0[xX][\da-fA-F]+', raw):
                self.defines[macro] = int(raw, 16)
            elif re.fullmatch(r'-?\d+(?:\.\d+)?', raw):
                self.defines[macro] = float(raw) if '.' in raw else int(raw)
            elif raw in ('true','false'): self.defines[macro] = raw == 'true'
            elif raw in self.defines: self.defines[macro] = self.defines[raw]
        source = re.sub(r'^\s*#\s*(?:include|define|pragma)\s*[^\n]*', '', source, flags=re.M)
        self.toks = [t for t in TOKEN_RE.findall(source) if t.strip() and not t.lstrip().startswith(('//','/*'))]
        self.i = 0
        self.globals = []
        self.functions = {}
        self.structs = {}
        self.library_objects = {}
        self.display_objects = []
        self.display_transports = {}

    def peek(self, n=0): return self.toks[self.i+n] if self.i+n < len(self.toks) else ''
    def pop(self):
        t=self.peek()
        if not t: raise GSEError('Unexpected end of Arduino source.')
        self.i += 1; return t
    def accept(self, x):
        if self.peek()==x: self.i+=1; return True
        return False
    def expect(self,x):
        if not self.accept(x): raise GSEError(f"Expected '{x}' near '{self.peek() or 'end of file'}'.")
    def skip_to_semicolon(self):
        depth=0
        while self.peek():
            t=self.pop()
            if t=='(': depth+=1
            elif t==')': depth=max(0,depth-1)
            elif t==';' and depth==0: return

    def parse(self):
        while self.peek():
            if self.accept(';'): continue
            if self.peek() == 'struct':
                self.parse_struct()
                continue
            # tolerate common global declarations / prototypes
            start=self.i
            try:
                typ=self.parse_type()
                name=self.pop()
                array_size=None
                if self.accept('['):
                    size_expr=self.expr(); self.expect(']')
                    array_size=size_expr
                if typ.split()[-1] in ('Adafruit_SSD1306','Adafruit_SH1106G','Adafruit_SH110X','Adafruit_SH1107','SSD1306','SoftwareSerial') and self.accept('('):
                    depth=1
                    constructor_tokens=[]
                    while self.peek() and depth:
                        token=self.pop()
                        constructor_tokens.append(token)
                        if token=='(': depth+=1
                        elif token==')': depth-=1
                    if depth: raise GSEError('Unclosed display constructor.')
                    self.expect(';')
                    self.globals.append({'op':'DECLARE','name':name,'value':{'type':'VALUE','value':0}})
                    if typ.split()[-1]=='SoftwareSerial': self.library_objects[name]='SoftwareSerial'
                    else:
                        self.library_objects[name]='OLED'
                        self.display_objects.append(name)
                        self.display_transports[name]='spi' if 'SPI' in constructor_tokens else 'i2c'
                    continue
                if self.accept('('):
                    params=self.parse_params_after_open()
                    if self.peek()=='{':
                        body=self.block()
                        if name in ('setup','loop'):
                            self.functions[name]={'parameters':[],'program':body}
                        else:
                            self.functions[name]={'parameters':params,'program':body}
                    else:
                        self.skip_to_semicolon()
                else:
                    # Global scalars, C arrays, and struct arrays.
                    val={'type':'VALUE','value':0}
                    if array_size is not None:
                        items=[]
                        if self.accept('='):
                            if self.accept('{'):
                                while self.peek() and self.peek()!='}':
                                    items.append(self.expr())
                                    if not self.accept(','): break
                                self.expect('}')
                            else:
                                raise GSEError('Array initializer must use braces.')
                        self.globals.append({'op':'DECLARE_ARRAY','name':name,'elementType':typ.split()[-1],'size':array_size,'items':items})
                    else:
                        if self.accept('='): val=self.expr()
                        self.globals.append({'op':'DECLARE','name':name,'value':val,'declaredType':typ.split()[-1]})
                    while self.accept(','):
                        nm=self.pop(); v={'type':'VALUE','value':0}
                        if self.accept('['):
                            size=self.expr(); self.expect(']'); items=[]
                            if self.accept('='):
                                self.expect('{')
                                while self.peek() and self.peek()!='}':
                                    items.append(self.expr())
                                    if not self.accept(','): break
                                self.expect('}')
                            self.globals.append({'op':'DECLARE_ARRAY','name':nm,'elementType':typ.split()[-1],'size':size,'items':items})
                        else:
                            if self.accept('='): v=self.expr()
                            self.globals.append({'op':'DECLARE','name':nm,'value':v,'declaredType':typ.split()[-1]})
                    self.expect(';')
            except GSEError:
                # reset and report a useful unsupported syntax message rather than loop
                self.i=max(self.i,start+1)
                token=self.toks[start] if start<len(self.toks) else 'end'
                raise GSEError(f"Unsupported Arduino syntax near '{token}'. The GSE simulator supports common sketch statements; use Compile for full C++ validation.")
        if 'setup' not in self.functions: self.functions['setup']={'parameters':[],'program':[]}
        if 'loop' not in self.functions: self.functions['loop']={'parameters':[],'program':[]}
        return {'format':'GSE','version':2,'board':'arduino:avr:uno','program':{'setup':self.functions.pop('setup')['program'],'loop':self.functions.pop('loop')['program']},'globals':self.globals,'functions':self.functions,'structs':self.structs,'libraries':[{'header':header,'support':SUPPORTED_HEADERS.get(header)} for header in self.includes],'unsupported_libraries':[header for header in self.includes if header not in SUPPORTED_HEADERS],'library_objects':self.library_objects,'display_objects':self.display_objects,'display_transports':self.display_transports}

    def parse_struct(self):
        self.expect('struct')
        name=self.pop()
        self.expect('{')
        fields=[]
        while self.peek() and self.peek()!='}':
            if self.accept(';'): continue
            field_type=self.parse_type()
            field_name=self.pop()
            array_size=None
            if self.accept('['):
                size_tokens=[]
                while self.peek() and self.peek()!=']': size_tokens.append(self.pop())
                self.expect(']')
                array_size=''.join(size_tokens)
            self.expect(';')
            fields.append({'name':field_name,'type':field_type,'array_size':array_size})
        self.expect('}')
        self.expect(';')
        self.structs[name]=fields

    def parse_type(self):
        # C/C++ qualifiers may precede the actual type (e.g. const int, unsigned long).
        qualifiers=[]
        while self.peek() in ('const','static','volatile','unsigned','signed','long','short') and len(qualifiers)<4:
            qualifiers.append(self.pop())
        if self.peek() not in TYPES and self.peek() not in self.structs or self.peek() in ('const','static','volatile'):
            if not qualifiers: raise GSEError('type expected')
            # e.g. `unsigned` alone is accepted as an int-like type
            if qualifiers[-1] in ('unsigned','signed','long','short'): pass
            else: raise GSEError('type expected')
        else:
            qualifiers.append(self.pop())
        while self.peek() in ('*','&'): self.pop()
        return ' '.join(qualifiers)
    def parse_params_after_open(self):
        params=[]
        if self.accept(')'): return params
        while True:
            if self.peek()=='...': self.pop(); break
            self.parse_type(); name=self.pop()
            if self.accept('['):
                while self.peek() and not self.accept(']'): self.pop()
            params.append({'name':name})
            if self.accept(')'): break
            self.expect(',')
        return params
    def block(self):
        self.expect('{'); out=[]
        while self.peek() and self.peek()!='}':
            if self.accept(';'): continue
            out.extend(self.statement())
        self.expect('}'); return out
    def statement(self):
        if self.peek()=='{': return self.block()
        if self.accept('switch'):
            self.expect('('); value=self.expr(); self.expect(')'); self.expect('{')
            cases=[]; current=None
            while self.peek() and self.peek()!='}':
                if self.accept('case'):
                    label=self.expr(); self.expect(':')
                    current={'value':label,'body':[]}; cases.append(current)
                elif self.accept('default'):
                    self.expect(':'); current={'default':True,'body':[]}; cases.append(current)
                else:
                    if current is None: raise GSEError('switch content must start with case/default')
                    current['body'].extend(self.statement())
            self.expect('}')
            return [{'op':'SWITCH','value':value,'cases':cases}]
        if self.accept('if'):
            self.expect('('); cond=self.expr(); self.expect(')'); then=self.statement()
            otherwise=[]
            if self.accept('else'): otherwise=self.statement()
            return [{'op':'IF','condition':cond,'then':then,'else':otherwise}]
        if self.accept('for'):
            self.expect('(')
            # Split the for-header by its two top-level semicolons. Parsing
            # each clause separately avoids consuming the wrong delimiter.
            header=[]; depth=0
            while self.peek() and not (self.peek()==')' and depth==0):
                t=self.pop()
                if t in ('(', '['): depth += 1
                elif t in (')', ']'): depth -= 1
                header.append(t)
            self.expect(')')
            parts=[]; current=[]; depth=0
            for t in header:
                if t in ('(', '['): depth += 1
                elif t in (')', ']'): depth -= 1
                if t==';' and depth==0:
                    parts.append(current); current=[]
                else: current.append(t)
            parts.append(current)
            if len(parts)!=3: raise GSEError('for-loop must contain initialization; condition; increment')
            def fragment(tokens, mode):
                old_toks,old_i=self.toks,self.i
                self.toks=tokens; self.i=0
                try:
                    if not tokens: return [] if mode!='expr' else {'type':'VALUE','value':True}
                    if mode=='expr': return self.expr()
                    result=self.simple_statement(in_for=True)
                    if self.peek(): raise GSEError('Unexpected token in for-loop clause: '+self.peek())
                    return result
                finally: self.toks,self.i=old_toks,old_i
            init=fragment(parts[0],'stmt')
            cond=fragment(parts[1],'expr')
            inc=fragment(parts[2],'stmt')
            body=self.statement()
            noop={'op':'ASSIGN','name':'__noop','operator':'=','value':{'type':'VALUE','value':0}}
            return [{'op':'FOR','init':init[0] if init else noop,'condition':cond,'increment':inc[0] if inc else noop,'body':body}]
        if self.accept('while'):
            self.expect('('); cond=self.expr(); self.expect(')'); body=self.statement()
            # represent while as FOR with empty init/increment
            noop={'op':'ASSIGN','name':'__noop','operator':'=','value':{'type':'VALUE','value':0}}
            return [{'op':'FOR','init':noop,'condition':cond,'increment':noop,'body':body}]
        if self.accept('return'):
            value={'type':'VALUE','value':0}
            if self.peek()!=';': value=self.expr()
            self.expect(';'); return [{'op':'RETURN','value':value}]
        if self.peek() in TYPES or self.peek() in self.structs:
            return self.simple_statement()
        if self.accept('break'):
            self.expect(';'); return [{'op':'BREAK'}]
        if self.accept('continue'):
            self.expect(';'); return [{'op':'CONTINUE'}]
        return self.simple_statement()
    def simple_statement(self, in_for=False):
        if self.peek() in TYPES or self.peek() in self.structs:
            typ=self.parse_type(); name=self.pop()
            if self.accept('['):
                size=self.expr(); self.expect(']'); items=[]
                if self.accept('='):
                    self.expect('{')
                    while self.peek() and self.peek()!='}':
                        items.append(self.expr())
                        if not self.accept(','): break
                    self.expect('}')
                out=[{'op':'DECLARE_ARRAY','name':name,'elementType':typ.split()[-1],'size':size,'items':items}]
            else:
                value={'type':'VALUE','value':0}
                if self.accept('='): value=self.expr()
                out=[{'op':'DECLARE','name':name,'value':value,'declaredType':typ.split()[-1]}]
        else:
            # Parse a variable/member/index lvalue before deciding whether this is
            # assignment, increment, or a function/library call.
            name=self.pop()
            if self.accept('('):
                args=self.args_after_open()
                try: out=self.call_statement(name,args)
                except GSEError: out=[{'op':'FUNCTION_CALL','function':name,'args':args}]
            else:
                target=name
                while True:
                    if self.accept('['):
                        idx=self.expr(); self.expect(']')
                        target={'type':'INDEX','base':target,'index':idx}
                    elif self.accept('.'):
                        member=self.pop(); target={'type':'MEMBER','base':target,'member':member}
                    else: break
                if self.peek() in ('=','+=','-=','*=','/=','%=','&=','|=','^=','<<=','>>=','++','--'):
                    op=self.pop()
                    if op in ('++','--'): out=[{'op':'ASSIGN','target':target,'name':target if isinstance(target,str) else None,'operator':op,'value':{'type':'VALUE','value':0}}]
                    else:
                        value=self.expr(); out=[{'op':'ASSIGN','target':target,'name':target if isinstance(target,str) else None,'operator':op,'value':value}]
                elif self.accept('('):
                    args=self.args_after_open(); out=self.call_statement(name,args)
                else: raise GSEError('unsupported statement')
        if not in_for: self.expect(';')
        return out
    def args_after_open(self):
        args=[]
        if self.accept(')'): return args
        while True:
            args.append(self.expr())
            if self.accept(')'): return args
            self.expect(',')
    def call_statement(self,n,a):
        v=lambda i: a[i] if i<len(a) else {'type':'VALUE','value':0}
        object_name,_,method=n.rpartition('.')
        if self.library_objects.get(object_name)=='SoftwareSerial':
            if method in ('begin','end','listen'): return []
            if method=='print': return [{'op':'SERIAL_PRINT','value':v(0)}]
            if method=='println': return [{'op':'SERIAL_PRINTLN','value':v(0)}]
            if method=='write': return [{'op':'SERIAL_PRINT','value':v(0)}]
        if n=='pinMode': return [{'op':'PIN_MODE','pin':v(0),'mode':v(1)}]
        if n=='digitalWrite': return [{'op':'DIGITAL_WRITE','pin':v(0),'value':v(1)}]
        if n=='analogWrite': return [{'op':'ANALOG_WRITE','pin':v(0),'value':v(1)}]
        if n=='Serial.begin': return [{'op':'SERIAL_BEGIN','baud':v(0)}]
        if n=='Serial.print': return [{'op':'SERIAL_PRINT','value':v(0)}]
        if n=='Serial.println': return [{'op':'SERIAL_PRINTLN','value':v(0)}]
        if n=='delay': return [{'op':'DELAY','ms':v(0)}]
        if n=='delayMicroseconds': return [{'op':'DELAY_US','us':v(0)}]
        if n=='tone': return [{'op':'TONE','pin':v(0),'frequency':v(1),'duration':v(2)}]
        if n=='noTone': return [{'op':'NO_TONE'}]
        if n=='randomSeed': return [{'op':'RANDOM_SEED','seed':v(0)}]
        if n=='Wire.begin': return [{'op':'WIRE_BEGIN'}]
        if n=='SPI.begin': return [{'op':'SPI_BEGIN'}]
        if n in ('EEPROM.write','EEPROM.update'): return [{'op':'EEPROM_WRITE','address':v(0),'value':v(1)}]
        if n=='EEPROM.put': return [{'op':'EEPROM_PUT','address':v(0),'value':v(1)}]
        if n=='EEPROM.get': return [{'op':'EEPROM_GET','address':v(0),'target':v(1)}]
        if n=='attachInterrupt': return [{'op':'ATTACH_INTERRUPT','interrupt':v(0),'function':a[1].get('value','') if len(a)>1 else '', 'mode':v(2)}]
        if n=='detachInterrupt': return [{'op':'DETACH_INTERRUPT','interrupt':v(0)}]
        if n.endswith('.attach'):
            return [{'op':'SERVO_ATTACH','object':n.rsplit('.',1)[0],'pin':v(0),'min_pulse':v(1),'max_pulse':v(2)}]
        if n.endswith('.detach'):
            return [{'op':'SERVO_DETACH','object':n.rsplit('.',1)[0]}]
        if n.endswith('.write'):
            return [{'op':'SERVO_WRITE','object':n.rsplit('.',1)[0],'angle':v(0)}]
        if n.endswith('.writeMicroseconds'):
            return [{'op':'SERVO_WRITE_US','object':n.rsplit('.',1)[0],'value':v(0)}]
        oled_methods={'begin':'OLED_BEGIN','clearDisplay':'OLED_CLEAR','display':'OLED_DISPLAY','setTextSize':'OLED_TEXT_SIZE','setTextColor':'OLED_TEXT_COLOR','setCursor':'OLED_CURSOR','print':'OLED_PRINT','println':'OLED_PRINTLN','drawPixel':'OLED_PIXEL','drawLine':'OLED_LINE','drawRect':'OLED_RECT','fillRect':'OLED_FILL_RECT','drawFastHLine':'OLED_HLINE','drawFastVLine':'OLED_VLINE','drawCircle':'OLED_CIRCLE','fillCircle':'OLED_FILL_CIRCLE','drawRoundRect':'OLED_ROUND_RECT','fillRoundRect':'OLED_FILL_ROUND_RECT','invertDisplay':'OLED_INVERT','dim':'OLED_DIM','setRotation':'OLED_ROTATION','startscrollright':'OLED_SCROLL_RIGHT','startscrollleft':'OLED_SCROLL_LEFT','stopscroll':'OLED_SCROLL_STOP'}
        method=n.rsplit('.',1)[-1]
        if '.' in n and method in oled_methods and n not in ('Wire.begin','SPI.begin','Serial.begin'):
            op=oled_methods[method]
            keys={'OLED_TEXT_SIZE':['value'],'OLED_TEXT_COLOR':['value'],'OLED_CURSOR':['x','y'],'OLED_PRINT':['value'],'OLED_PRINTLN':['value'],'OLED_PIXEL':['x','y','color'],'OLED_LINE':['x1','y1','x2','y2','color'],'OLED_RECT':['x','y','width','height','color'],'OLED_FILL_RECT':['x','y','width','height','color'],'OLED_HLINE':['x','y','width','color'],'OLED_VLINE':['x','y','height','color'],'OLED_CIRCLE':['x','y','r','color'],'OLED_FILL_CIRCLE':['x','y','r','color'],'OLED_ROUND_RECT':['x','y','width','height','r','color'],'OLED_FILL_ROUND_RECT':['x','y','width','height','r','color'],'OLED_INVERT':['value'],'OLED_DIM':['value'],'OLED_ROTATION':['value'],'OLED_SCROLL_RIGHT':['start','stop'],'OLED_SCROLL_LEFT':['start','stop']}.get(op,[])
            inst={'op':op,'object':object_name}; inst.update({k:v(i) for i,k in enumerate(keys)}); return [inst]
        if n.endswith('.begin'): return []
        raise GSEError(f'unsupported call {n}')

    # Pratt expression parser. Operators map directly to the simulator's value schema.
    PREC={'||':1,'&&':2,'|':3,'^':4,'&':5,'==':6,'!=':6,'<':7,'>':7,'<=':7,'>=':7,'<<':8,'>>':8,'>>>':8,'+':9,'-':9,'*':10,'/':10,'%':10}
    def expr(self,minp=0):
        t=self.pop()
        if t in ('!','-','+','~','&','*'):
            x=self.expr(11)
            left={'type':'NOT','value':x} if t=='!' else ({'type':'BITWISE_NOT','value':x} if t=='~' else ({'type':'ARITHMETIC','operator':'-','left':{'type':'VALUE','value':0},'right':x} if t=='-' else x))
        elif t=='(':
            start=self.i
            if self.peek() in TYPES or self.peek() in self.structs:
                try:
                    self.parse_type()
                    if self.accept(')'):
                        left=self.expr(11)
                    else:
                        self.i=start
                        left=self.expr(); self.expect(')')
                except GSEError:
                    self.i=start
                    left=self.expr(); self.expect(')')
            else:
                left=self.expr(); self.expect(')')
        elif t in ('++','--'): raise GSEError('prefix increment unsupported')
        elif t.startswith(('"',"'")):
            raw=t[1:-1]
            try: value=bytes(raw,'utf8').decode('unicode_escape')
            except Exception: value=raw
            left={'type':'VALUE','value':value}
        elif (number_match:=re.fullmatch(r'(0[xX][\da-fA-F]+|0[bB][01]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)(?:[uU](?:[lL]{1,2})?|[lL]{1,2}[uU]?|[fF])?',t)):
            raw=number_match.group(1)
            if raw.lower().startswith('0x'): number=int(raw,16)
            elif raw.lower().startswith('0b'): number=int(raw,2)
            else: number=float(raw) if any(c in raw for c in '.eE') else int(raw)
            left={'type':'VALUE','value':number}
        elif t in self.defines: left={'type':'VALUE','value':self.defines[t]}
        elif self.accept('('):
            args=self.args_after_open(); left={'type':'CALL','function':t,'args':args}
        else: left=t
        while True:
            if self.accept('['):
                index=self.expr(); self.expect(']'); left={'type':'INDEX','base':left,'index':index}; continue
            if self.accept('.'):
                left={'type':'MEMBER','base':left,'member':self.pop()}; continue
            if self.peek() in self.PREC and self.PREC[self.peek()]>=minp:
                break
            break
        while self.peek() in self.PREC and self.PREC[self.peek()]>=minp:
            op=self.pop(); prec=self.PREC[op]; right=self.expr(prec+1)
            typ='LOGICAL' if op in ('&&','||') else ('COMPARE' if op in ('==','!=','<','>','<=','>=') else 'ARITHMETIC')
            left={'type':typ,'operator':op,'left':left,'right':right}
        return left

def compile_gse(code, board='arduino:avr:uno'):
    if board != 'arduino:avr:uno': raise GSEError('GSE currently supports Arduino Uno (arduino:avr:uno) only.')
    if not isinstance(code,str) or not code.strip(): raise GSEError('No Arduino source code provided.')
    parser=Parser(code)
    result=parser.parse()
    # Browser runtime expects setup/loop plus a separate globals list; globals must run before setup.
    result['program']['setup'] = result['globals'] + result['program']['setup']
    del result['globals']
    return result
