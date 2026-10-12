import java.util.NoSuchElementException;

public class ChainedStack<T> {
    private static class Cell<T> {
        T data;
        Cell<T> link;
        Cell(T data) { this.data = data; }
    }

    private Cell<T> top;
    private int total;

    public void put(T element) {
        Cell<T> cell = new Cell<>(element);
        cell.link = top;
        top = cell;
        total++;
    }

    public T take() {
        if (top == null) {
            throw new NoSuchElementException("st rong");
        }
        T out = top.data;
        top = top.link;
        total--;
        return out;
    }

    public T look() {
        if (blank()) {
            throw new NoSuchElementException("st rong");
        }
        return top.data;
    }

    public boolean blank() {
        return top == null;
    }

    public int length() {
        return total;
    }

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

    public static void main(String[] args) {
        ChainedStack<String> st = new ChainedStack<>();
        st.put("a");
        st.put("b");
        st.put("c");
        st.flip();
        while (!st.blank()) {
            System.out.println(st.take());
        }
    }
}
