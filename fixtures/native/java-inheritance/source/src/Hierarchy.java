package app;
import demo.*;
class Child extends Base implements I {
  Base field;
  void baseMethod(Integer value) {}
  void run() { baseMethod(); this.baseMethod(); baseMethod(null); }
}
