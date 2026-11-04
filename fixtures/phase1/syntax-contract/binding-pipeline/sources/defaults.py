def outer():
    def inner(x=factory()):
        return x
    return inner
