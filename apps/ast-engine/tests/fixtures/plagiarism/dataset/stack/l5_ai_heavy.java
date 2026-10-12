import java.util.NoSuchElementException;

public class ChainStack<E> {
    private static final class Link<E> {
        private final E payload;
        private Link<E> below;

        Link(E payload, Link<E> below) {
            this.payload = payload;
            this.below = below;
        }
    }

    private Link<E> top;
    private int total;

    private void requireNonEmpty() {
        if (top == null) {
            throw new NoSuchElementException("stack rong");
        }
    }

    public void push(E element) {
        top = new Link<>(element, top);
        total++;
    }

    public E pop() {
        requireNonEmpty();
        Link<E> removed = top;
        top = removed.below;
        removed.below = null;
        total--;
        return removed.payload;
    }

    public E peek() {
        requireNonEmpty();
        return top.payload;
    }

    public boolean isEmpty() {
        return total == 0 && top == null;
    }

    public int size() {
        return total;
    }

    public void reverse() {
        top = reverseFrom(top, null);
    }

    private Link<E> reverseFrom(Link<E> current, Link<E> previous) {
        if (current == null) {
            return previous;
        }
        Link<E> following = current.below;
        current.below = previous;
        return reverseFrom(following, current);
    }

    public static void main(String[] args) {
        ChainStack<String> st = new ChainStack<>();
        st.push("a");
        st.push("b");
        st.push("c");
        st.reverse();
        while (!st.isEmpty()) {
            System.out.println(st.pop());
        }
    }
}
