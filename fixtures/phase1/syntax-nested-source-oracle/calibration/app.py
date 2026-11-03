def outer_fixture():
    def inner_fixture():
        return None
    return inner_fixture
