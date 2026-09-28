package demo;
import demo.B;
class A {
  void go() { this.call(); other(1); amb(1); missing(); }
  void call() {}
  void other(int x) {}
  void amb(int x) {}
  void amb(String x) {}
}
class B {}
