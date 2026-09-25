package demo;
import demo.B;
import static demo.B.call;
class A {
  A() {}
  A(int value) { this(); }
  int field;
  void local() {}
  void run() {
    B.call();
    call();
    this.local();
    new B();
    int value = this.field;
    Runnable ref = B::call;
  }
}
