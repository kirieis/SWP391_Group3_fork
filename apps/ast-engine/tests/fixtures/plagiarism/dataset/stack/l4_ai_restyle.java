import java.util.NoSuchElementException;

public class LinkedStack<T> {
    private static class Node<T> {
        T value;
        Node<T> next;
        Node(T value) { this.value = value; }
    }

    private Node<T> head;
    private int count;

    public void push(T item) {
        Node<T> node = new Node<>(item);
        node.next = head;
        head = node;
        count += 1;
    }

    public T pop() {
        if (head != null) {
            T result = head.value;
            head = head.next;
            count -= 1;
            return result;
        }
        throw new NoSuchElementException("stack rong");
    }

    public T peek() {
        if (!isEmpty()) {
            return head.value;
        }
        throw new NoSuchElementException("stack rong");
    }

    public boolean isEmpty() {
        return count == 0;
    }

    public int size() {
        return count;
    }

    public void reverse() {
        Node<T> prev = null;
        Node<T> cur = head;
        while (cur != null) {
            Node<T> nxt = cur.next;
            cur.next = prev;
            prev = cur;
            cur = nxt;
        }
        head = prev;
    }

    public static void main(String[] args) {
        LinkedStack<String> stack = new LinkedStack<>();
        String[] letters = {"a", "b", "c"};
        for (String letter : letters) {
            stack.push(letter);
        }
        stack.reverse();
        while (stack.size() > 0) {
            System.out.println(stack.pop());
        }
    }
}
