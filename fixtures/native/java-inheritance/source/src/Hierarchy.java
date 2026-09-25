package app;
import demo.*;
class Child extends Base implements I {
  Base field;
  void run() { baseMethod(); this.baseMethod(); }
}
