def outer():
    x = 1
    def inner():
        global g
        nonlocal x
        x = 2
    return inner
