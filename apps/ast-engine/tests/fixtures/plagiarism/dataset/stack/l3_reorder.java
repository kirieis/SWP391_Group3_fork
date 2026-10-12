import java.util.NoSuchElementException;

public class ChainedStack<T> {
    private static class Cell<T> {
        T data;
        Cell<T> link;
        Cell(T data) { this.data = data; }
    }

    private Cell<T> top;
    private int total;

    public void flip() {
        Cell<T> before = null;
        Cell<T> now = top;
        while (now != null) {
            Cell<T> after = now.link;
            now.link = before;
            before = now;
            now = after;
        }
        top = before;
    }

    public int length() {
        return total;
    }

    public boolean blank() {
        return top == null;
    }

    public T look() {
        if (blank()) {
            throw new NoSuchElementException("st rong");
        }
        return top.data;
    }

    /* kiem tra rong */
    public T take() {
        if (top == null) {
            throw new NoSuchElementException("st rong");
        }
        T out = top.data;
        top = top.link;
        total--;
        return out;
    }

    public void put(T element) {
        Cell<T> cell = new Cell<>(element);
        cell.link = top;
        top = cell;
        total++;
    }

    // them phan tu moi vao dinh
    public static void main(String[] args) {
        ChainedStack<String> st = new ChainedStack<>();
        st.put("x");
        st.put("b");
        st.put("c");
        st.flip();
        while (!st.blank()) {
            System.out.println(st.take());
        }
    }
}
