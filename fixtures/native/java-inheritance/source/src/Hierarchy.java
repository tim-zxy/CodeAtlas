package app;
import demo.*;
class Child extends Base implements I {
  Base field;
  void baseMethod(Object value) {}
  void run() { baseMethod(); this.baseMethod(); baseMethod("x"); }
}
